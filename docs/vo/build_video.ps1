# BrigPay final video assembly — ffmpeg staged build
# Output: docs/vo/brigpay-final.mp4 (1280x720, 30fps, H.264 + AAC, VO loudnorm -14 LUFS)
$ErrorActionPreference = "Continue"
$bin = "C:\Users\Hype AMD\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin"
$ff = "$bin\ffmpeg.exe"
$VO = "C:\Users\Hype AMD\projects\brigpay\docs\vo"
$CL = "$VO\clips"
$work = "$VO\build"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$enc = @("-c:v","libx264","-crf","18","-preset","medium","-pix_fmt","yuv420p","-r","30","-an","-y")

Write-Host "=== seg0 title (zoom) ==="
& $ff -y -i "$VO\title.png" -vf "scale=5120:2880,zoompan=z='min(1+0.0009*on,1.18)':d=220:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=30,format=yuv420p" -frames:v 220 @enc "$work\seg0.mp4" 2>$null

Write-Host "=== seg1 broll intro (mulai 8s, setelah loading) ==="
& $ff -y -ss 8.0 -t 8.72 -i "$CL\broll.webm" -vf "scale=1280:720,fps=30,format=yuv420p" -frames:v 262 @enc "$work\seg1.mp4" 2>$null

Write-Host "=== seg2 sceneA 1.854x ==="
& $ff -y -i "$CL\sceneA.webm" -vf "setpts=PTS/1.854,scale=1280:720,fps=30,format=yuv420p" -frames:v 420 @enc "$work\seg2.mp4" 2>$null

Write-Host "=== seg3 sceneB 1.820x ==="
& $ff -y -i "$CL\sceneB.webm" -vf "setpts=PTS/1.820,scale=1280:720,fps=30,format=yuv420p" -frames:v 227 @enc "$work\seg3.mp4" 2>$null

Write-Host "=== seg4 sceneC slow 0.596x + freeze ==="
& $ff -y -i "$CL\sceneC.webm" -vf "setpts=PTS/0.5957,tpad=stop_mode=clone:stop_duration=8,trim=0:13.16,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p" -frames:v 395 @enc "$work\seg4.mp4" 2>$null

Write-Host "=== seg5 sceneD ss4.5 speed 2.65x ==="
& $ff -y -ss 4.5 -i "$CL\sceneD.webm" -vf "setpts=PTS/2.65,tpad=stop_mode=clone:stop_duration=3,trim=0:12.70,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p" -frames:v 381 @enc "$work\seg5.mp4" 2>$null

Write-Host "=== seg6 sceneE ss6.5 ==="
& $ff -y -ss 6.5 -i "$CL\sceneE.webm" -vf "tpad=stop_mode=clone:stop_duration=2,trim=0:6.50,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p" -frames:v 195 @enc "$work\seg6.mp4" 2>$null

Write-Host "=== seg7 broll outro (ss9.5 slow-mo 0.853x) ==="
& $ff -y -ss 9.5 -i "$CL\broll.webm" -vf "setpts=PTS/0.853,tpad=stop_mode=clone:stop_duration=2,trim=0:14.88,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p" -frames:v 447 @enc "$work\seg7.mp4" 2>$null

# durasi semua segmen harus 1280x720@30fps identik → concat demuxer
Write-Host "=== concat ==="
$concatList = (0..7 | ForEach-Object { "file '$work\seg$_.mp4'" -replace '\\','/' }) -join "`n"
Set-Content -Path "$work\concat.txt" -Value $concatList -Encoding ascii
& $ff -y -f concat -safe 0 -i "$work\concat.txt" -c copy "$work\video.mp4" 2>$null

Write-Host "=== audio mix (7 VO + loudnorm) ==="
$fc = @"
[1:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=0:all=1[v0];
[2:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=7320:all=1[v1];
[3:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=16040:all=1[v2];
[4:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=30040:all=1[v3];
[5:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=37600:all=1[v4];
[6:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=50760:all=1[v5];
[7:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=69960:all=1[v6];
[0:a]apad=whole_dur=84.90[base];
[base][v0][v1][v2][v3][v4][v5][v6]amix=inputs=8:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=83.6:d=1.3,aformat=sample_rates=48000:channel_layouts=stereo[aout]
"@
& $ff -y -f lavfi -t 84.90 -i "anullsrc=r=48000:cl=stereo" -i "$VO\scene1_hook.wav" -i "$VO\scene2_intro.wav" -i "$VO\scene3_invoice.wav" -i "$VO\scene4_whopays.wav" -i "$VO\scene5_chase.wav" -i "$VO\scene6_paid_v2.wav" -i "$VO\scene7_close.wav" -filter_complex $fc -map "[aout]" -c:a pcm_s16le "$work\mix.wav" 2>$null

Write-Host "=== mux final ==="
& $ff -y -i "$work\video.mp4" -i "$work\mix.wav" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$VO\brigpay-final.mp4" 2>$null

$dur = & "$bin\ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$VO\brigpay-final.mp4"
"SELESAI: brigpay-final.mp4  durasi $([math]::Round([double]$dur,2))s"
