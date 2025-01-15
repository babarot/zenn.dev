Output demo.gif

#Set Theme "Builtin Solarized Dark"
#Set Theme "TokyoNightLight"
#Set Theme "nord"
#Set Theme "Tinacious Design (Light)"
#Set Theme "Violet Light"
#Set Theme "Tomorrow"

# Dark theme
Set Theme { "name": "Whimsy", "black": "#535178", "red": "#ef6487", "green": "#5eca89", "yellow": "#fdd877", "blue": "#65aef7", "magenta": "#aa7ff0", "cyan": "#43c1be", "white": "#ffffff", "brightBlack": "#535178", "brightRed": "#ef6487", "brightGreen": "#5eca89", "brightYellow": "#fdd877", "brightBlue": "#65aef7", "brightMagenta": "#aa7ff0", "brightCyan": "#43c1be", "brightWhite": "#ffffff", "background": "#29283b", "foreground": "#b3b0d6", "selection": "#3d3c58", "cursor": "#b3b0d6" }

# Light theme
#Set Theme { "name": "Spring", "black": "#000000", "red": "#ff4d83", "green": "#1f8c3b", "yellow": "#1fc95b", "blue": "#1dd3ee", "magenta": "#8959a8", "cyan": "#3e999f", "white": "#ffffff", "brightBlack": "#000000", "brightRed": "#ff0021", "brightGreen": "#1fc231", "brightYellow": "#d5b807", "brightBlue": "#15a9fd", "brightMagenta": "#8959a8", "brightCyan": "#3e999f", "brightWhite": "#ffffff", "background": "#ffffff", "foreground": "#4d4d4c", "cursor": "#f8aba6" }

Set FontSize 40
Set Width 1800
Set Height 1000

Set Shell bash

Hide
Type "github_token_repo_archiver=github_pat_xxxxx" Enter
Ctrl+L
Show

Set PlaybackSpeed 0.2

#Type "gh repo list --source --no-archived --visibility=public --limit 100 --json name,updatedAt --jq '.[] | [.updatedAt, .name] | @tsv' | sort | fzf | awk '{print $2}' | GITHUB_TOKEN=$github_token_repo_archiver xargs -I% gh repo archive --yes %" Enter

Type "gh repo list --source --no-archived --visibility=public \" Enter
Sleep 0.3s
Type "--limit 100 \" Enter
Sleep 0.3s
Type "--json name,updatedAt \" Enter
Sleep 0.3s
Type "--jq '.[] | [.updatedAt, .name] | @tsv' \" Enter
Sleep 0.3s
Type "| sort \" Enter
Sleep 0.3s
Type "| fzf \" Enter
Sleep 0.3s
Type "| awk '{print $2}' \" Enter
Sleep 0.3s
Type "| GITHUB_TOKEN=$github_token_repo_archiver \" Enter
Type "xargs -I{} gh repo archive --yes {}" Enter

Sleep 6s

Ctrl+I
Sleep 0.4s
Ctrl+I
Sleep 0.4s
Ctrl+I
Sleep 0.4s
Ctrl+I
Sleep 2s

Enter
Sleep 12s
