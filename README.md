# nog
Notes On a Grid.

## What is this?
A character grid-oriented note taking web app with scuffed vim motions.
| Modes               |
|---------------------|
| `NORMAL`            |
| `INSERT`            |
| `VISUAL`            |
| `PASTE-PENDING`     |
| `HIGHLIGHT`         |
| `HIGHLIGHT-PENDING` |
| `BOX`               |
| `ARROW`             |
| `COMMAND`           |

`H, J, K, L` to move cursor around in `NORMAL`, `VISUAL`, `PASTE-PENDING`, `HIGHLIGHT` , `HIGHLIGHT-PENDING`, `BOX`, and `ARROW` modes.  
Arrow keys to move around in `INSERT` and `COMMAND` modes.

## Features currently implemented
| Feature | Description                                                                                 |
|---------|---------------------------------------------------------------------------------------------|
| Save    | Saves note to localDB.                                                                      |
| Export  | Generates a string that contains the note in an encoded format, import not implemented yet. |
