# BrigPay final video assembly - ffmpeg staged build
# Output: docs/vo/brigpay-final.mp4 (1280x720, 30fps, H.264 + AAC, VO loudnorm -14 LUFS, original ambient bed)
# v2: no white page-load frames (dark freeze beats instead), sceneE reload removed, continuous music bed.
$ErrorActionPreference = "Continue"
$bin = "C:\Users\Hype AMD\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin"
$ff = "$bin\ffmpeg.exe"
$VO = "C:\Users\Hype AMD\projects\brigpay\docs\vo"
$CL = "$VO\clips"
$work = "$VO\build"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$enc = @("-c:v","libx264","-crf","18","-preset","medium","-pix_fmt","yuv420p","-r","30","-an","-y")
$vfEnd = "scale=1280:720,fps=30,format=yuv420p"

Write-Host "=== fill frames (gelap, pengganti layar putih) ==="
& $ff -y -ss 5.0   -i "$CL\sceneA.webm" -frames:v 1 -update 1 "$work\fillA.png" 2>$null
& $ff -y -ss 2.6   -i "$CL\sceneB.webm" -frames:v 1 -update 1 "$work\fillB.png" 2>$null
& $ff -y -ss 1.8   -i "$CL\sceneC.webm" -frames:v 1 -update 1 "$work\fillC.png" 2>$null
& $ff -y -ss 12.95 -i "$CL\sceneE.webm" -frames:v 1 -update 1 "$work\fillE.png" 2>$null

Write-Host "=== seg0 title (zoom) ==="
& $ff -y -i "$VO\title.png" -vf "scale=5120:2880,zoompan=z='min(1+0.0009*on,1.18)':d=220:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=30,format=yuv420p" -frames:v 220 @enc "$work\seg0.mp4" 2>$null

Write-Host "=== seg1 broll intro (mulai 10.5s, setelah data load) ==="
& $ff -y -ss 10.5 -t 8.72 -i "$CL\broll.webm" -vf "$vfEnd" -frames:v 262 @enc "$work\seg1.mp4" 2>$null

Write-Host "=== seg2a sceneA freeze 2.70s (81f) ==="
& $ff -y -loop 1 -framerate 30 -i "$work\fillA.png" -vf "$vfEnd" -frames:v 81 @enc "$work\seg2a.mp4" 2>$null
Write-Host "=== seg2b sceneA main 5s..end @1.854x (339f) ==="
& $ff -y -ss 5.0 -i "$CL\sceneA.webm" -vf "setpts=PTS/1.854,$vfEnd" -frames:v 339 @enc "$work\seg2b.mp4" 2>$null

Write-Host "=== seg3a sceneB freeze 1.43s (43f) ==="
& $ff -y -loop 1 -framerate 30 -i "$work\fillB.png" -vf "$vfEnd" -frames:v 43 @enc "$work\seg3a.mp4" 2>$null
Write-Host "=== seg3b sceneB main 2.6s..end @1.820x (184f) ==="
& $ff -y -ss 2.6 -i "$CL\sceneB.webm" -vf "setpts=PTS/1.820,$vfEnd" -frames:v 184 @enc "$work\seg3b.mp4" 2>$null

Write-Host "=== seg4a sceneC freeze 1.00s (30f) ==="
& $ff -y -loop 1 -framerate 30 -i "$work\fillC.png" -vf "$vfEnd" -frames:v 30 @enc "$work\seg4a.mp4" 2>$null
Write-Host "=== seg4b sceneC main 1.8s..end slow 0.596x + freeze (365f) ==="
& $ff -y -ss 1.8 -i "$CL\sceneC.webm" -vf "setpts=PTS/0.5957,tpad=stop_mode=clone:stop_duration=8,trim=0:12.1667,setpts=PTS-STARTPTS,$vfEnd" -frames:v 365 @enc "$work\seg4b.mp4" 2>$null

Write-Host "=== seg5 sceneD ss4.5 speed 2.65x ==="
& $ff -y -ss 4.5 -i "$CL\sceneD.webm" -vf "setpts=PTS/2.65,tpad=stop_mode=clone:stop_duration=3,trim=0:12.70,setpts=PTS-STARTPTS,$vfEnd" -frames:v 381 @enc "$work\seg5.mp4" 2>$null

Write-Host "=== seg6 sceneE (tanpa reload): 0.8s + 3.5s + freeze 2.2s ==="
& $ff -y -ss 6.5 -t 0.8 -i "$CL\sceneE.webm" -vf "$vfEnd" -frames:v 24 @enc "$work\seg6a.mp4" 2>$null
& $ff -y -ss 9.5 -t 3.5 -i "$CL\sceneE.webm" -vf "$vfEnd" -frames:v 105 @enc "$work\seg6b.mp4" 2>$null
& $ff -y -loop 1 -framerate 30 -i "$work\fillE.png" -vf "$vfEnd" -frames:v 66 @enc "$work\seg6c.mp4" 2>$null

Write-Host "=== seg7 broll outro (ss20 slow-mo 0.853x) ==="
& $ff -y -ss 20 -i "$CL\broll.webm" -vf "setpts=PTS/0.853,tpad=stop_mode=clone:stop_duration=2,trim=0:14.88,setpts=PTS-STARTPTS,$vfEnd" -frames:v 447 @enc "$work\seg7.mp4" 2>$null

# semua segmen identik 1280x720@30fps -> concat demuxer (urutan = timeline)
Write-Host "=== concat ==="
$order = @("seg0","seg1","seg2a","seg2b","seg3a","seg3b","seg4a","seg4b","seg5","seg6a","seg6b","seg6c","seg7")
$concatList = ($order | ForEach-Object { "file '$work\$_.mp4'" -replace '\\','/' }) -join "`n"
Set-Content -Path "$work\concat.txt" -Value $concatList -Encoding ascii
& $ff -y -f concat -safe 0 -i "$work\concat.txt" -c copy "$work\video.mp4" 2>$null

Write-Host "=== music bed (sintesis orisinal) ==="
& node "$VO\synth_music.cjs"
if (-not (Test-Path "$work\music.wav")) { Write-Host "GAGAL bikin music.wav"; exit 1 }

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

Write-Host "=== mux final (+ musik pelan di bawah VO) ==="
$fc2 = "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[vo];[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.12[mus];[vo][mus]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.9[aout]"
& $ff -y -i "$work\video.mp4" -i "$work\mix.wav" -i "$work\music.wav" -filter_complex $fc2 -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$VO\brigpay-final.mp4" 2>$null

$dur = & "$bin\ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$VO\brigpay-final.mp4"
"SELESAI: brigpay-final.mp4  durasi $([math]::Round([double]$dur,2))s"
