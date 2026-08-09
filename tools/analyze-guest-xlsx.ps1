param([Parameter(Mandatory=$true)][string]$Path, [switch]$Summary)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path))
try {
  function Read-Entry([string]$Name) {
    $entry = $archive.GetEntry($Name)
    if (-not $entry) { return $null }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  }

  $shared = @()
  $sharedXmlText = Read-Entry 'xl/sharedStrings.xml'
  if ($sharedXmlText) {
    [xml]$sharedXml = $sharedXmlText
    foreach ($item in $sharedXml.SelectNodes("//*[local-name()='si']")) {
      $shared += (($item.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText }) -join '')
    }
  }

  [xml]$workbook = Read-Entry 'xl/workbook.xml'
  [xml]$relationships = Read-Entry 'xl/_rels/workbook.xml.rels'
  $firstSheet = $workbook.SelectSingleNode("//*[local-name()='sheets']/*[local-name()='sheet'][1]")
  $relationshipId = $firstSheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $relationship = $relationships.SelectNodes("//*[local-name()='Relationship']") | Where-Object { $_.Id -eq $relationshipId }
  $target = [string]$relationship.Target
  if ($target.StartsWith('/')) { $sheetPath = $target.TrimStart('/') }
  elseif ($target.StartsWith('xl/')) { $sheetPath = $target }
  else { $sheetPath = 'xl/' + $target.TrimStart('./') }
  [xml]$sheetXml = Read-Entry $sheetPath

  $rows = foreach ($row in $sheetXml.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
    $values = [ordered]@{ row = [int]$row.GetAttribute('r'); A = ''; B = ''; C = ''; D = ''; E = ''; F = '' }
    foreach ($cell in $row.SelectNodes("./*[local-name()='c']")) {
      $column = ([regex]::Match([string]$cell.r, '^[A-Z]+')).Value
      if ($column -notin @('A','B','C','D','E','F')) { continue }
      $value = ''
      $cellType = $cell.GetAttribute('t')
      $rawValue = $cell.SelectSingleNode("./*[local-name()='v']")
      if ($cellType -eq 's') { $value = $shared[[int]$rawValue.InnerText] }
      elseif ($cellType -eq 'inlineStr') {
        $value = (($cell.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText }) -join '')
      }
      elseif ($cellType -eq 'b') { $value = if ($rawValue.InnerText -eq '1') { 'TRUE' } else { 'FALSE' } }
      else { $value = if ($rawValue) { $rawValue.InnerText } else { '' } }
      $values[$column] = ([string]$value).Trim()
    }
    if (($values.A + $values.B + $values.C + $values.D + $values.E + $values.F).Length -gt 0) {
      [pscustomobject]$values
    }
  }

  if ($Summary) {
    function Normalize-Name([string]$Value) {
      $base = ([string]$Value -replace '\s*\([^)]*\)\s*$', '').Normalize([Text.NormalizationForm]::FormD)
      $builder = [Text.StringBuilder]::new()
      foreach ($char in $base.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$builder.Append($char) }
      }
      return (($builder.ToString().ToLowerInvariant() -replace '[^a-z0-9 ]', ' ') -replace '\s+', ' ').Trim()
    }

    $dataRows = @($rows | Where-Object { $_.row -ge 3 })
    $groups = @()
    for ($index = 0; $index -lt $dataRows.Count; $index++) {
      $anchor = $dataRows[$index]
      if (-not $anchor.A) { continue }
      $guestNames = @()
      for ($cursor = $index; $cursor -lt $dataRows.Count; $cursor++) {
        if ($cursor -gt $index -and $dataRows[$cursor].A) { break }
        if ($dataRows[$cursor].F) { $guestNames += $dataRows[$cursor].F }
      }
      $normalizedAnchor = Normalize-Name $anchor.A
      $primaryMatches = @($guestNames | Where-Object { (Normalize-Name $_) -eq $normalizedAnchor })
      $digits = ([string]$anchor.C -replace '\D', '')
      $ddiDigits = ([string]$anchor.B -replace '\D', '')
      $phoneValid = if ($ddiDigits) { ($ddiDigits + $digits).Length -ge 10 -and ($ddiDigits + $digits).Length -le 15 } else { $digits.Length -eq 11 }
      $groups += [pscustomobject]@{
        row = $anchor.row
        invitation = $anchor.A
        ddi = $anchor.B
        phone = $anchor.C
        phone_valid = $phoneValid
        guests = $guestNames
        primary_match_count = $primaryMatches.Count
      }
    }
    $duplicatePhones = @($groups | Group-Object phone | Where-Object { $_.Name -and $_.Count -gt 1 } | ForEach-Object { [pscustomobject]@{ phone = $_.Name; invitations = @($_.Group.invitation) } })
    [pscustomobject]@{
      sheet = [string]$firstSheet.name
      invitations = $groups.Count
      guest_rows = (@($groups | ForEach-Object { $_.guests })).Count
      invitations_with_companions = (@($groups | Where-Object { $_.guests.Count -gt 1 })).Count
      invitations_without_companions = (@($groups | Where-Object { $_.guests.Count -eq 1 })).Count
      invalid_phones = @($groups | Where-Object { -not $_.phone_valid } | Select-Object row,invitation,ddi,phone)
      duplicate_phones = $duplicatePhones
      missing_or_ambiguous_primary = @($groups | Where-Object { $_.primary_match_count -ne 1 } | Select-Object row,invitation,phone,guests,primary_match_count)
      groups = $groups
    } | ConvertTo-Json -Depth 6
  }
  else {
    [pscustomobject]@{
      sheet = [string]$firstSheet.name
      source = (Resolve-Path -LiteralPath $Path).Path
      rows = @($rows)
    } | ConvertTo-Json -Depth 5
  }
}
finally {
  $archive.Dispose()
}
