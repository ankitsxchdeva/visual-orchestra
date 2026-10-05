# fan-layout.gif — ten agents, finished ones compacted, branches spread.
# Record from the repo root: vhs scripts/fan.tape
# Note: no Hide here — a Hide-wrapped boot produced a blank recording once
# (vhs 0.12.1, cause not isolated); the visible cascade reads well anyway.
Output fan-layout.gif

Set FontFamily "Menlo"
Set FontSize 13
Set Width 1300
Set Height 740
Set Padding 12
Set Framerate 15
Set TypingSpeed 0ms
Set Theme "Builtin Tango Dark"

Type "node scripts/demo.mjs --agents 10 --running 3 --live"
Sleep 1.2s
Enter

# Cascade populates the board (~4s); init collapses ~9.7s after Enter.
Sleep 9.5s
Type "k"
Sleep 2.5s
Type "k"
Sleep 2.5s
Type "j"
Sleep 3s
