param([Parameter(Mandatory=$true)][string]$Path)

$preview = (& "$PSScriptRoot\build-rsvp-import.ps1" -Path $Path | ConvertFrom-Json)
$random = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($random)
$secret = ([Convert]::ToBase64String($random)).TrimEnd('=').Replace('+','-').Replace('/','_')
Set-Clipboard -Value $secret

function Sql-Text([string]$Value) { return "'" + ([string]$Value).Replace("'", "''") + "'" }
function Phone-Hash([string]$Phone) {
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  try { return ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Phone))).Replace('-','').ToLowerInvariant()) }
  finally { $hmac.Dispose() }
}

$lines = [Collections.Generic.List[string]]::new()
$lines.Add('begin;')
$lines.Add('do $import$')
$lines.Add('declare v_invitation uuid;')
$lines.Add('begin')
foreach ($invitation in $preview.invitations) {
  $hash = Phone-Hash $invitation.phone
  $lines.Add("  if not exists (select 1 from public.invitation_contacts where phone_hash = '$hash') then")
  $lines.Add('    insert into public.invitations (display_name) values (' + (Sql-Text $invitation.invitation) + ') returning id into v_invitation;')
  $lines.Add("    insert into public.invitation_contacts (invitation_id, phone_hash, is_primary) values (v_invitation, '$hash', true);")
  foreach ($guest in $invitation.guests) {
    $lines.Add('    insert into public.guests (invitation_id, full_name, guest_type, display_order) values (v_invitation, ' + (Sql-Text $guest.name) + ', ' + (Sql-Text $guest.type) + ', ' + [int]$guest.display_order + ');')
  }
  $lines.Add('  end if;')
}
$lines.Add('end')
$lines.Add('$import$;')
$lines.Add('commit;')
$lines.Add('')
$lines.Add("select count(*) as convites from public.invitations where display_name <> 'Convidado Teste';")
$lines.Add("select count(*) as pessoas from public.guests where full_name not in ('Convidado Teste', 'Acompanhante Teste');")

$outputDir = Join-Path (Split-Path $PSScriptRoot -Parent) '.private'
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
$outputPath = Join-Path $outputDir 'rsvp-import.sql'
[IO.File]::WriteAllLines($outputPath, $lines, [Text.UTF8Encoding]::new($false))
[pscustomobject]@{ sql = $outputPath; invitations = $preview.summary.invitations; guests = $preview.summary.guests; secret_copied = $true }
