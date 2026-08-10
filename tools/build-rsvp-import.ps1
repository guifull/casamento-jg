param([Parameter(Mandatory=$true)][string]$Path)

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)

$report = (& "$PSScriptRoot\analyze-guest-xlsx.ps1" -Summary -Path $Path | ConvertFrom-Json)
$culture = [Globalization.CultureInfo]::GetCultureInfo('pt-BR')
$particles = @('da','das','de','do','dos','e')

function Clean-Name([string]$Value) {
  $clean = (([string]$Value -replace '\s*\([^)]*\)\s*$', '') -replace '\s+', ' ').Trim()
  $words = $culture.TextInfo.ToTitleCase($clean.ToLower($culture)).Split(' ')
  for ($index = 1; $index -lt $words.Count; $index++) {
    if ($particles -contains $words[$index].ToLowerInvariant()) { $words[$index] = $words[$index].ToLowerInvariant() }
  }
  return ($words -join ' ')
}

function Normalize-Name([string]$Value) {
  $base = (Clean-Name $Value).Normalize([Text.NormalizationForm]::FormD)
  $builder = [Text.StringBuilder]::new()
  foreach ($char in $base.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$builder.Append($char) }
  }
  return (($builder.ToString().ToLowerInvariant() -replace '[^a-z0-9 ]', ' ') -replace '\s+', ' ').Trim()
}

$cleanGroups = foreach ($group in $report.groups) {
  $invitation = Clean-Name $group.invitation
  $guests = @($group.guests | ForEach-Object { Clean-Name $_ })

  switch ([int]$group.row) {
    35 { $invitation = 'Felipe Wanderley'; $guests = @('Felipe Wanderley','Laís') }
    49 { $invitation = 'Isadora Novaes'; $guests = @('Isadora Novaes','Augusto Barison') }
    57 { $invitation = 'João Marcelo Sobral'; $guests = @('João Marcelo Sobral','Mayra Sobral') }
    125 { $invitation = 'Ritta Sobral'; $guests = @('Ritta Sobral','Guilherme Sobral') }
    131 { $invitation = 'Simone Oliveira'; $guests = @('Simone Oliveira','João Victor','Pedro Henrique','Toninho') }
  }

  $primaryIndex = -1
  for ($index = 0; $index -lt $guests.Count; $index++) {
    if ((Normalize-Name $guests[$index]) -eq (Normalize-Name $invitation)) { $primaryIndex = $index; break }
  }
  if ($primaryIndex -lt 0) { throw "Titular não identificado na linha $($group.row): $invitation" }
  $orderedGuests = @($guests[$primaryIndex]) + @($guests | Where-Object { $_ -ne $guests[$primaryIndex] })
  $ddi = ([string]$group.ddi -replace '\D', '')
  $phone = ([string]$group.phone -replace '\D', '')
  if ($ddi) { $phone = $ddi + $phone }

  [pscustomobject]@{
    source_row = [int]$group.row
    invitation = $invitation
    phone = $phone
    guests = @($orderedGuests | ForEach-Object -Begin { $order = 0 } -Process {
      $item = [pscustomobject]@{ name = $_; type = $(if ($order -eq 0) { 'primary' } else { 'guest' }); display_order = $order }
      $order++
      $item
    })
  }
}

$allGuests = @($cleanGroups | ForEach-Object { $_.guests })
[pscustomobject]@{
  summary = [pscustomobject]@{
    invitations = $cleanGroups.Count
    guests = $allGuests.Count
    primary = (@($allGuests | Where-Object { $_.type -eq 'primary' })).Count
    companions = (@($allGuests | Where-Object { $_.type -eq 'guest' })).Count
  }
  invitations = @($cleanGroups)
} | ConvertTo-Json -Depth 7
