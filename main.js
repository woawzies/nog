const saveButton = document.getElementById("save-button")
const exportButton = document.getElementById("export-button")
const exportViewer = document.getElementById("export-viewer")
const saveText = document.getElementById("save-text")
const editorCanvas = document.getElementById("editor")
const editor = editorCanvas.getContext("2d")

function resizeCanvas() {
	const dpr = window.devicePixelRatio || 1

	editorCanvas.width = window.innerWidth * dpr
	editorCanvas.height = window.innerHeight * dpr

    editorCanvas.style.width = window.innerWidth + "px"
    editorCanvas.style.height = window.innerHeight + "px"

	editor.setTransform(dpr, 0, 0, dpr, 0, 0)
}

resizeCanvas()
window.addEventListener("resize", resizeCanvas)

const request = indexedDB.open("notes", 1)

window.db = null
let state = {
    chunks: {}
}

const CHUNK_SIZE = 100

request.onupgradeneeded = (event) => {
	window.db = event.target.result

	const store = window.db.createObjectStore("data", {
        keyPath: "id"
	})
}

request.onerror = () => {
	console.log("Failed to open DB")
}





function saveJSON(data) {
	const tx = window.db.transaction("data", "readwrite")
	const store = tx.objectStore("data")

	store.put({
		id: "main",
		content: structuredClone(data)
	})
}

function loadJSON() {
    const tx = window.db.transaction("data", "readonly")
    const store = tx.objectStore("data")
    const req = store.get("main")
    req.onsuccess = () => {
        state = req.result?.content || { chunks: {} }
    }
}





function getChunkCoord(x, y) {
    return {
        cx: Math.floor(x / CHUNK_SIZE),
        cy: Math.floor(y / CHUNK_SIZE)
    }
}

function getLocalCoord(x, y) {
    return {
        lx: ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
		ly: ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    }
}

function putChar(x, y, char, color=0) {
	const { cx, cy } = getChunkCoord(x, y)
	const { lx, ly } = getLocalCoord(x, y)

	const chunkId = `${cx},${cy}`

	if (!state.chunks[chunkId]) {
		state.chunks[chunkId] = {}
	}

	const chunk = state.chunks[chunkId]
	const key = `${lx},${ly}`

	if (char === " ") {
		delete chunk[key]
	} else {
		chunk[key] = [char, color]
	}
}

function getChar(x, y) {
	const { cx, cy } = getChunkCoord(x, y)
	const { lx, ly } = getLocalCoord(x, y)

	const chunkId = `${cx},${cy}`
	const chunk = state.chunks[chunkId]

	if (!chunk) return null

	const key = `${lx},${ly}`

	return chunk[key] ?? null
}

function removeChar(x, y) {
	const { cx, cy } = getChunkCoord(x, y)
	const { lx, ly } = getLocalCoord(x, y)

	const chunkId = `${cx},${cy}`
	const chunk = state.chunks[chunkId]

	if (!chunk) return

	const key = `${lx},${ly}`

	delete chunk[key]
}

function clearMain() {
	state = { chunks: {} }

	const tx = window.db.transaction("data", "readwrite")
	const store = tx.objectStore("data")

	store.put({
		id: "main",
		content: state
	})
}




let running = false
let idleTime = null

function resetIdleTime() {
    clearTimeout(idleTime)
    console.log("Idle Time reset!")
    idleTime = setTimeout(() => {
        console.log("Idle now.")
        interruptRender()
    }, 2000)
}

function startRender() {
    if (running) return
    running = true
    loop()
}

function interruptRender() {
    running = false
}

const WIDTH_DIVISOR = 8
const HEIGHT_DIVISOR = 3.2
let cameraX = 0
let cameraY = 0

let targetCameraX = 0
let targetCameraY = 0

let cursorX = 0
let cursorY = 0

let zoom = 1
let targetZoom = 1

const Mode = Object.freeze({
    NORMAL: 0,
    INSERT: 1,
    VISUAL: 2,
    PASTE_PENDING: 3,
    BOX: 4,
    ARROW: 5,
    HIGHLIGHT: 6,
    HIGHLIGHT_PENDING: 7,
    COMMAND: 8
})

let mode = Mode.NORMAL

let textMetric
let charWidth = 0
let charHeight = 0

function lerp(a, b, t) {
	return a + (b - a) * t
}

function drawRoundedRect(x, y, w, h, r) {
	r = Math.min(r, w / 2, h / 2)

	editor.beginPath()

	editor.moveTo(x + r, y)

	editor.lineTo(x + w - r, y)
	editor.arcTo(x + w, y, x + w, y + r, r)

	editor.lineTo(x + w, y + h - r)
	editor.arcTo(x + w, y + h, x + w - r, y + h, r)

	editor.lineTo(x + r, y + h)
	editor.arcTo(x, y + h, x, y + h - r, r)

	editor.lineTo(x, y + r)
	editor.arcTo(x, y, x + r, y, r)

	editor.closePath()
    editor.fill()
}

function updateCameraTarget() {
	targetCameraX = cursorX
	targetCameraY = cursorY
}

let boxStart = {
    x: 0,
    y: 0
}

let boxEnd = {
    x: 0,
    y: 0
}

let isDrawingBox = false

function startBox(x, y) {
    isDrawingBox = true
    boxStart.x = x
    boxStart.y = y
}

function endBox(x, y) {
    isDrawingBox = false
    boxEnd.x = x
    boxEnd.y = y
    const left = Math.min(boxStart.x, boxEnd.x)
    const right = Math.max(boxStart.x, boxEnd.x)
    const up = Math.min(boxStart.y, boxEnd.y)
    const down = Math.max(boxStart.y, boxEnd.y)
    if ((left == right) || (up == down)) return
    // top edge
    for (let ix = left+1; ix < right; ix++) {
        putChar(ix, up, "─")
        putChar(ix, down, "─")
    }
    // left edge
    for (let iy = up+1; iy < down; iy++) {
        putChar(left, iy, "│")
        putChar(right, iy, "│")
    }
    putChar(left, up, "╭")
    putChar(right, up, "╮")
    putChar(left, down, "╰")
    putChar(right, down, "╯")
}

let selectionStart = {
    x: 0,
    y: 0
}

let selectionEnd = {
    x: 0,
    y: 0
}

let isSelecting = false

let selectionOrigin = { x: 0, y: 0 }

let selectionBuffer = []

function startSelection(x, y) {
    isSelecting = true
    selectionStart.x = x
    selectionStart.y = y
}

function endSelection(x, y) {
    isSelecting = false
    selectionEnd.x = x
    selectionEnd.y = y
    const left = Math.min(selectionStart.x, selectionEnd.x)
    const right = Math.max(selectionStart.x, selectionEnd.x)
    const up = Math.min(selectionStart.y, selectionEnd.y)
    const down = Math.max(selectionStart.y, selectionEnd.y)
    selectionBuffer = []
    selectionOrigin.x = left
    selectionOrigin.y = up
    for (let iy = up; iy <= down; iy++) {
        let temp = []
        for (let ix = left; ix <= right; ix++) {
            const char = getChar(ix, iy) ?? " "
            temp.push(char)
        }
        selectionBuffer.push(temp)
    }
    for (let ix = left; ix <= right; ix++) {
        for (let iy = up; iy <= down; iy++) {
            removeChar(ix, iy)
        }
    }

}

function pasteSelection(x, y) {
     for (let iy = 0; iy < selectionBuffer.length; iy++) {
         for (let ix = 0; ix < selectionBuffer[0].length; ix++) {
             putChar(x + ix, y + iy, selectionBuffer[iy][ix][0], selectionBuffer[iy][ix][1])
         }
     }
}

highlightStart = {
    x: 0,
    y: 0
}

highlightColor = 0

highlightWords = 1

function startHighlight(x, y) {
    highlightStart.x = x
    highlightStart.y = y
}

function highlightWord() {
    words = 0
    for (let i = 0; i < 1000; i++) {
        const data = getChar(highlightStart.x + i, highlightStart.y)
        const char = data ? data[0] : null

        if (char === null) {
            if (words == highlightWords-1) {
                break
            }
            words++
            continue
        }

        putChar(highlightStart.x + i, highlightStart.y, char, highlightColor)
    }
}
document.addEventListener("keydown", (e) => {
    resetIdleTime()
    startRender()

    if (mode === Mode.NORMAL) {
        switch (e.key) {
            case "h":
                cursorX--
                break
            case "l":
                cursorX++
                break
            case "k":
                cursorY--
                break
            case "j":
                cursorY++
                break
            case "i":
                mode = Mode.INSERT
                break
            case "x":
                removeChar(cursorX, cursorY)
                break
            case "=":
                targetZoom+=0.2*targetZoom
                break
            case "-":
                targetZoom-=0.2*targetZoom
                break
            case "b":
                startBox(cursorX, cursorY)
                mode = Mode.BOX
                break
            case "v":
                mode = Mode.VISUAL
                startSelection(cursorX, cursorY)
                break
            case "g":
                mode = Mode.HIGHLIGHT
                startHighlight(cursorX, cursorY)
                break
            case "a":
                mode = Mode.ARROW
                break
            default:
                return
        }
    } else if (mode === Mode.INSERT) {
        if (e.key.length === 1) {
            if (e.key === " ") {
                cursorX++
            } else {
                putChar(cursorX, cursorY, e.key)
                cursorX++
            }
        } else {
            switch (e.key) {
                case "Escape":
                    mode = Mode.NORMAL
                    break
                case "Backspace":
                    if ((getChar(cursorX, cursorY) === null) && (getChar(cursorX-1, cursorY) != null)) {
                        cursorX--
                        removeChar(cursorX, cursorY)
                    } else {
                        removeChar(cursorX, cursorY)
                        cursorX--
                    }
                    break
                case "Enter":
                    let x = cursorX

                    let consecutiveSpaces = 0

                    for (let i = 0; i < 1000; i++) {
                        const data = getChar(cursorX-i, cursorY)
                        const char = data ? data[0] : null
                        
                        if (consecutiveSpaces === 2) {
                            break
                        }

                        if (char === null || !(char.codePointAt(0) >= 32 && char.codePointAt(0) <= 126)) {
                            consecutiveSpaces++
                        } else {
                            consecutiveSpaces = 0
                        }
                        x--
                    }
                    cursorX = x+3
                    cursorY++
                    updateCameraTarget()
                    break
                case "Tab":
                    cursorX += 2
                    break
                case "ArrowLeft":
                    cursorX--
                    break
                case "ArrowRight":
                    cursorX++
                    break
                case "ArrowUp":
                    cursorY--
                    break
                case "ArrowDown":
                    cursorY++
                    break
            }
        }
    } else if (mode === Mode.VISUAL) {
        switch (e.key) {
            case "h":
                cursorX--
                break
            case "l":
                cursorX++
                break
            case "k":
                cursorY--
                break
            case "j":
                cursorY++
                break
            case "v":
                endSelection(cursorX, cursorY)
                cursorX = selectionOrigin.x
                cursorY = selectionOrigin.y
                mode = Mode.PASTE_PENDING
                break
            case "Escape":
                mode = Mode.NORMAL
                break
        }
    } else if (mode === Mode.PASTE_PENDING) {
        switch (e.key) {
            case "h":
                cursorX--
                break
            case "l":
                cursorX++
                break
            case "k":
                cursorY--
                break
            case "j":
                cursorY++
                break
            case "Enter":
                mode = Mode.NORMAL
                pasteSelection(cursorX, cursorY)
                break
            case "Escape":
                mode = Mode.NORMAL
                cursorX = selectionOrigin.x
                cursorY = selectionOrigin.y
                pasteSelection(cursorX, cursorY)
                break
        }
    } else if (mode === Mode.BOX) {
        switch (e.key) {
            case "h":
                cursorX--
                break
            case "l":
                cursorX++
                break
            case "k":
                cursorY--
                break
            case "j":
                cursorY++
                break
            case "b":
                endBox(cursorX, cursorY)
                mode = Mode.NORMAL
                break
            case "Escape":
                mode = Mode.NORMAL
                break
        }
    } else if (mode === Mode.ARROW) {
        switch (e.key) {
            case "h":
                putChar(cursorX, cursorY, "←")
                break
            case "l":
                putChar(cursorX, cursorY, "→")
                break
            case "k":
                putChar(cursorX, cursorY, "↑")
                break
            case "j":
                putChar(cursorX, cursorY, "↓")
                break
            case "Escape":
                mode = Mode.NORMAL
                break
        }
    } else if (mode === Mode.HIGHLIGHT) {
        if (e.key.length == 1 && e.key[0] >= '0' && e.key[0] <= '9') {
            mode = Mode.HIGHLIGHT_PENDING
            highlightColor = parseInt(e.key)
        } else if (e.key === "Escape") {
            mode = Mode.NORMAL
        }
    } else if (mode === Mode.HIGHLIGHT_PENDING) {
        if (e.key === "w") {
            mode = Mode.NORMAL
            highlightWord()
        } else if (e.key.length == 1 && e.key[0] >= '1' && e.key[0] <= '9') {
            highlightWords = parseInt(e.key)
        }
    }

	updateCameraTarget()
})

let gridEnabled = false
function render() {
    const zoomSpeed = 0.15
    zoom = lerp(zoom, targetZoom, zoomSpeed)
    const scaledW = charWidth * zoom
    const scaledH = charHeight * zoom
    editor.font = `${32 * zoom}px JetBrainsMono`

    const followSpeed = 0.15
    cameraX = lerp(cameraX, targetCameraX, followSpeed)
    cameraY = lerp(cameraY, targetCameraY, followSpeed)
    
	editor.clearRect(0, 0, editorCanvas.width, editorCanvas.height)

	const width = editorCanvas.width
	const height = editorCanvas.height

	// WORLD camera (NOT pixel camera)
	const camX = cameraX
	const camY = cameraY

    const halfCols = Math.ceil(width / (2 * scaledW))
    const halfRows = Math.ceil(height / (2 * scaledH))

	const startWorldX = Math.floor(camX - halfCols)
	const endWorldX = Math.ceil(camX + halfCols)

	const startWorldY = Math.floor(camY - halfRows)
	const endWorldY = Math.ceil(camY + halfRows)

	// =========================
	// GRID (stable + negative-safe)
	// =========================
    if (gridEnabled) {
        editor.lineWidth = 1

        for (let worldX = startWorldX; worldX <= endWorldX; worldX++) {
            const screenX =
                (worldX - camX) * scaledW + width/WIDTH_DIVISOR

            editor.beginPath()
            editor.moveTo(Math.floor(screenX) + 0.5, 0)
            editor.lineTo(Math.floor(screenX) + 0.5, height)

            editor.strokeStyle = (worldX % 2 === 0) ? "#bababa" : "#e0e0e0"
            editor.stroke()
        }

        for (let worldY = startWorldY; worldY <= endWorldY; worldY++) {
            const screenY =
                (worldY - camY) * scaledH + height/HEIGHT_DIVISOR

            editor.beginPath()
            editor.moveTo(0, Math.floor(screenY) + 0.5)
            editor.lineTo(width, Math.floor(screenY) + 0.5)

            editor.strokeStyle = (worldY % 2 === 0) ? "#bababa" : "#e0e0e0"
            editor.stroke()
        }
    }

	// =========================
	// CHUNKS (FIXED)
	// =========================

	const startChunk = getChunkCoord(startWorldX, startWorldY)
	const endChunk = getChunkCoord(endWorldX, endWorldY)

	for (let chunkX = startChunk.cx; chunkX <= endChunk.cx; chunkX++) {
		for (let chunkY = startChunk.cy; chunkY <= endChunk.cy; chunkY++) {

			const chunkKey = `${chunkX},${chunkY}`
			const chunk = state.chunks[chunkKey]

			if (!chunk) continue

			for (const key in chunk) {
				const [localX, localY] = key.split(",").map(Number)
				const char = chunk[key][0]
                const color = chunk[key][1]

				const worldX = chunkX * CHUNK_SIZE + localX
				const worldY = chunkY * CHUNK_SIZE + localY

				const screenX =
					(worldX - camX) * scaledW + width/WIDTH_DIVISOR

				const screenY =
					(worldY - camY) * scaledH + height/HEIGHT_DIVISOR
                
                switch (color) {
                    case 0:
                        editor.fillStyle = "#cdd6f4"
                        break
                    case 1:
                        editor.fillStyle = "#a6adc8"
                        break
                    case 2:
                        editor.fillStyle = "#f38ba8"
                        break
                    case 3:
                        editor.fillStyle = "#fab387"
                        break
                    case 4:
                        editor.fillStyle = "#f9e2af"
                        break
                    case 5:
                        editor.fillStyle = "#a6e3a1"
                        break
                    case 6:
                        editor.fillStyle = "#89b4fa"
                        break
                    case 7:
                        editor.fillStyle = "#cba6f7"
                        break
                }
				editor.fillText(
					char,
					Math.floor(screenX),
					Math.floor(screenY)
				)
			}
		}
	}

	const screenX =
		(cursorX - cameraX) * scaledW + width/WIDTH_DIVISOR

	const screenY =
		(cursorY - cameraY -1) * scaledH + height/HEIGHT_DIVISOR
    
    editor.fillStyle = "#ffffff4a"
    
    switch (mode) {
        case Mode.INSERT:
            drawRoundedRect(
                Math.floor(screenX),
                Math.floor(screenY)+46*zoom,
                charWidth*zoom,
                (charHeight-40)*zoom,
                3*zoom
            )
            break
        case Mode.VISUAL: 
            const left = Math.min(selectionStart.x, cursorX)
            const right = Math.max(selectionStart.x, cursorX)
            const up = Math.min(selectionStart.y, cursorY)
            const down = Math.max(selectionStart.y, cursorY)

            const widthCells = right - left + 1
            const heightCells = down - up + 1

            const x =
                (left - cameraX) * scaledW + width/WIDTH_DIVISOR

            const y =
                (up - cameraY - 1) * scaledH + height/HEIGHT_DIVISOR

            drawRoundedRect(
                Math.floor(x),
                Math.floor(y) + 10 * zoom,
                charWidth * zoom * widthCells,
                (charHeight*heightCells - 5) * zoom,
                3 * zoom
            )

            break
        case Mode.BOX:
            editor.fillStyle = "#ffff8a4a"
            drawRoundedRect(
                Math.floor(screenX),
                Math.floor(screenY)+10*zoom,
                charWidth*zoom,
                (charHeight-5)*zoom,
                3*zoom
            )
            break
        default:
            drawRoundedRect(
                Math.floor(screenX),
                Math.floor(screenY)+10*zoom,
                charWidth*zoom,
                (charHeight-5)*zoom,
                3*zoom
            )
    }
    
    if (isDrawingBox) {
        editor.fillStyle = "#ff8a8a"
        editor.fillText("X", (boxStart.x - cameraX) * scaledW + width/WIDTH_DIVISOR, (boxStart.y - cameraY) * scaledH + height/HEIGHT_DIVISOR)
        
        editor.fillStyle = "#8aff8a"
        editor.fillText("X", (cursorX - cameraX) * scaledW + width/WIDTH_DIVISOR, (cursorY - cameraY) * scaledH + height/HEIGHT_DIVISOR)
    }
    
    editor.fillStyle = "#ffffff4a"
    editor.font = "32px JetBrainsMono"
    editor.fillText(`x: ${cursorX}, y: ${cursorY}`, 50, 50)
    let modeText;
    switch (mode) {
        case Mode.NORMAL:
            modeText = "NORMAL"
            break
        case Mode.VISUAL:
            modeText = "VISUAL"
            break
        case Mode.PASTE_PENDING:
            modeText = "PASTE-PENDING"
            break
        case Mode.INSERT:
            modeText = "INSERT"
            break
        case Mode.BOX:
            modeText = "BOX"
            break
        case Mode.COMMAND:
            modeText = "COMMAND"
            break
        default:
            return
    }
    editor.fillText(modeText, 50, 100)
}

let exportedText = ""

function loop() {
    if (!running) return
    render()
    saveText.textContent = exportedText
    requestAnimationFrame(loop)
}

async function init() {
    await document.fonts.load("24px JetBrainsMono")
    editor.font = "32px JetBrainsMono"
    editor.textRendering = "optimiseLegibility"
    editor.fillStyle = "#000"
    textMetric = editor.measureText("M")
    charWidth = Math.round(textMetric.width)
    charHeight = Math.round(textMetric.actualBoundingBoxAscent + textMetric.actualBoundingBoxDescent) + 20
    resetIdleTime()
    startRender()
}

function onResize() {
    editor.font = `${32 * zoom}px JetBrainsMono`
    editor.textRendering = "optimiseLegibility"
    editor.fillStyle = "#000"
    startRender()

}

window.addEventListener("resize", onResize)

request.onsuccess = (event) => {
    window.db = event.target.result
    
    loadJSON()
    resizeCanvas()
    init()
}

saveButton.addEventListener("click", () => {
    console.log("DB:", window.db)
    console.log("chunks:", state.chunks)
    saveJSON(
        state
    )
})

let exportOpen = false;
exportButton.addEventListener("click", () => {
	
    if (exportOpen === false) {
        exportedText = ""
        for (const [chunkPos, chunk] of Object.entries(state.chunks)) {
            const [chunkX, chunkY] = chunkPos.split(",").map(Number)

            for (const [cellPos, charData] of Object.entries(chunk)) {
                const [x, y] = cellPos.split(",").map(Number)

                const worldX = chunkX * CHUNK_SIZE + x
                const worldY = chunkY * CHUNK_SIZE + y

                const char = charData[0]
                const color = charData[1]

                exportedText +=
                    worldX.toString(16).padStart(3, "0") +
                    worldY.toString(16).padStart(3, "0") +
                    char +
                    color.toString(16) +
                    "!"
            }
        }
        exportViewer.style.display = "block"
        exportOpen = true
    } else {
        exportViewer.style.display = "none"
        exportOpen = false
    }

	console.log(exportedText);
});
