
$ErrorActionPreference = 'Stop'

$names = @(
    'OCF_STAGING_ONLY',
    'OCF_STAGING_DATABASE_URL',
    'OCF_STAGING_ALLOWED_DATABASE_HOST',
    'OCF_STAGING_ALLOWED_DATABASE_NAME'
)

$old = @{}
foreach ($name in $names) {
    $old[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$secureUrl = $null
$urlPointer = [IntPtr]::Zero
$exitCode = 0

try {
    $secureUrl = Read-Host 'Paste Neon STAGING Direct URL (input hidden)' -AsSecureString
    $urlPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)

    $env:OCF_STAGING_ONLY = 'YES'
    $env:OCF_STAGING_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($urlPointer)
    $env:OCF_STAGING_ALLOWED_DATABASE_HOST = 'ep-small-violet-b5aitvum.c-7.us-east-2.aws.neon.tech'
    $env:OCF_STAGING_ALLOWED_DATABASE_NAME = 'neondb'

    @'
const { createStagingClient } = require('./scripts/staging-db');

try {
  createStagingClient();
  console.log('PASS: Local validation passed; no database connection was made.');
} catch (error) {
  console.log('FAIL: ' + (error.name === 'StagingGuardError' ? error.message : 'Local validation failed; details withheld.'));
  process.exitCode = 1;
}
'@ | node
    $nodeExitCode = $LASTEXITCODE
    if ($nodeExitCode -ne 0) {
        $exitCode = $nodeExitCode
        throw 'Node validation returned a non-zero exit code.'
    }
}
catch {
    if ($exitCode -eq 0) {
        $exitCode = 1
    }
    Write-Host 'The validation script failed. Check the error above; sensitive values were not displayed.'
}
finally {
    if ($urlPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($urlPointer)
    }
    if ($null -ne $secureUrl) {
        $secureUrl.Dispose()
    }

    foreach ($name in $names) {
        if ($null -eq $old[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "Env:$name" $old[$name]
        }
    }
}

if ($exitCode -ne 0) {
    exit $exitCode
}