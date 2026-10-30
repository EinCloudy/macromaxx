$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and
    $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type] $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    $task.GetAwaiter().GetResult()
}
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$players = @()
$artworkBytes = 0
foreach ($session in $manager.GetSessions()) {
    try {
        $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime])
        $art = ''
        # Artwork failure must not hide the session or its title. Bound the total
        # IPC payload even when many applications publish media sessions.
        if ($null -ne $props.Thumbnail) {
            $stream = $null
            $reader = $null
            try {
                $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime])
                if ($stream.Size -gt 0 -and $stream.Size -le 5MB -and ($artworkBytes + $stream.Size) -le 15MB) {
                    $reader = [Windows.Storage.Streams.DataReader]::new($stream)
                    $loaded = Await ($reader.LoadAsync([uint32] $stream.Size)) ([uint32])
                    $bytes = New-Object byte[] $loaded
                    $reader.ReadBytes($bytes)
                    $art = 'data:image/png;base64,' + [Convert]::ToBase64String($bytes)
                    $artworkBytes += $loaded
                }
            } catch { $art = '' }
            finally {
                if ($null -ne $reader) { try { $reader.Dispose() } catch {} }
                if ($null -ne $stream) { try { $stream.Dispose() } catch {} }
            }
        }
        $players += @{
            id = $session.SourceAppUserModelId
            status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
            title = $props.Title
            artist = $props.Artist
            album = $props.AlbumTitle
            artUrl = $art
            volume = $null
        }
    } catch { continue }
}
ConvertTo-Json -InputObject @($players) -Depth 4 -Compress
