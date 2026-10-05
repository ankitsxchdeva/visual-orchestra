# radial-layout.gif — hub with four subagent nodes on spokes.
# Record from the repo root: vhs scripts/radial.tape
Output radial-layout.gif

Set FontFamily "Menlo"
Set FontSize 14
Set Width 1080
Set Height 480
Set Padding 12
Set Framerate 15
Set TypingSpeed 0ms
Set Theme "Builtin Tango Dark"

# Boot and populate the board while hidden.
Hide
Type "node scripts/demo.mjs --agents 4 --running 2 --live"
Enter
Sleep 3s
Show

# Pulse, activity rotation, and the oldest agent collapsing at ~5s in.
Sleep 6s
Type "k"
Sleep 3s
Type "j"
Sleep 3s
