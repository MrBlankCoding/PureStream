import { Canvas, FabricObject, IText, PencilBrush, Point, util } from 'fabric';
import { ws } from './websocket';
import { state } from './state';

interface ObjectModifiedEvent {
    target?: FabricObject;
}

interface RemoteCursor {
    x: number;
    y: number;
    username: string;
    element: HTMLElement;
}

const CONSTANTS = {
    ZOOM: {
        MIN: 0.2,
        MAX: 4,
        FACTOR: 0.999,
    },
    BRUSH: {
        DEFAULT_SIZE: 3,
        HIGHLIGHTER_MULTIPLIER: 3,
        HIGHLIGHTER_MIN: 10,
        ERASER_MULTIPLIER: 4,
        ERASER_MIN: 15,
        HIGHLIGHTER_ALPHA: 0.4,
    },
    TEXT: {
        DEFAULT_SIZE: 24,
        DEFAULT_FONT: 'Inter, sans-serif',
        DEFAULT_CONTENT: 'Type...',
    },
    CURSOR: {
        UPDATE_INTERVAL: 50,
        TRANSITION_DURATION: '0.1s',
    },
    EXPORT: {
        FORMAT: 'png' as const,
        QUALITY: 1,
        MULTIPLIER: 2,
        FILENAME_PREFIX: 'purestream-whiteboard',
    },
} as const;

export class WhiteboardManager {
    private canvas: Canvas | null = null;
    private container: HTMLElement | null = null;
    private toolbar: HTMLElement | null = null;
    private color = '#000000';
    private currentTool = 'pen';
    private brushSize: number = CONSTANTS.BRUSH.DEFAULT_SIZE;
    private isRemoteUpdate = false;
    private isSpaceDown = false;
    private isPanning = false;
    private lastPanX = 0;
    private lastPanY = 0;
    private remoteCursors = new Map<string, RemoteCursor>();
    private cursorContainer: HTMLElement | null = null;
    private eventCleanupFunctions: Array<() => void> = [];

    constructor() {
        this.setupSocketListeners();
        this.bindGlobalEventListeners();
    }

    init(containerId: string): void {
        const container = document.getElementById(containerId);
        if (!container) return;

        this.container = container;
        const toolbar = container.querySelector('#whiteboard-toolbar') as HTMLElement | null;
        this.toolbar = toolbar;
        
        container.innerHTML = '';
        if (toolbar) container.appendChild(toolbar);

        const canvasEl = this.createCanvasElement();
        if (container.firstChild) {
            container.insertBefore(canvasEl, container.firstChild);
        } else {
            container.appendChild(canvasEl);
        }

        this.resizeCanvasElement(canvasEl);
        this.initializeCanvas(canvasEl);
        this.setupCursorContainer();
        this.setTool('pen');
        this.setupCanvasListeners();
        this.setupCursorTracking();
        this.restoreState();
        this.setupBrushSizeControl();
    }

    private createCanvasElement(): HTMLCanvasElement {
        const canvasEl = document.createElement('canvas');
        canvasEl.id = 'whiteboard-canvas';
        canvasEl.style.display = 'block';
        canvasEl.style.width = '100%';
        return canvasEl;
    }

    private initializeCanvas(canvasEl: HTMLCanvasElement): void {
        this.canvas = new Canvas(canvasEl, {
            isDrawingMode: true,
            width: canvasEl.width,
            height: canvasEl.height,
            backgroundColor: 'white',
        });

        this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    }

    private setupBrushSizeControl(): void {
        const brushSizeInput = document.getElementById('wb-brush-size') as HTMLInputElement | null;
        const brushSizeLabel = document.getElementById('wb-brush-size-label');
        
        if (!brushSizeInput) return;

        brushSizeInput.value = String(this.brushSize);
        if (brushSizeLabel) {
            brushSizeLabel.textContent = String(this.brushSize);
        }

        const handler = (e: Event) => {
            const size = parseInt((e.target as HTMLInputElement).value, 10);
            this.setBrushSize(size);
            if (brushSizeLabel) {
                brushSizeLabel.textContent = String(size);
            }
        };

        brushSizeInput.addEventListener('input', handler);
        this.eventCleanupFunctions.push(() => {
            brushSizeInput.removeEventListener('input', handler);
        });
    }

    private resizeCanvasElement(canvasEl: HTMLCanvasElement): void {
        if (!this.container) return;
        
        const parent = this.container.parentElement;
        const target = parent || this.container;
        const { width, height } = target.getBoundingClientRect();
        
        canvasEl.width = width;
        canvasEl.height = height;
        canvasEl.style.height = '100%';
    }

    private bindGlobalEventListeners(): void {
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        this.eventCleanupFunctions.push(() => {
            window.removeEventListener('resize', this.handleResize);
            window.removeEventListener('keydown', this.handleKeyDown);
            window.removeEventListener('keyup', this.handleKeyUp);
        });
    }

    private handleResize = (): void => {
        if (!this.canvas || !this.container) return;
        
        const parent = this.container.parentElement;
        const target = parent || this.container;
        const { width, height } = target.getBoundingClientRect();
        
        this.canvas.setDimensions({ width, height });
        this.canvas.renderAll();
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'Backspace' || e.code === 'Delete') {
            this.handleDeleteKey(e);
            return;
        }

        if (e.code === 'Space' && !this.isSpaceDown) {
            this.handleSpaceKeyDown();
        }
    };

    private handleDeleteKey(e: KeyboardEvent): void {
        if (!this.canvas) return;

        const editingText = this.canvas.getObjects().find(obj =>
            obj.type === 'IText' && (obj as IText).isEditing
        ) as IText | undefined;

        if (editingText) return;

        const activeObjects = this.canvas.getActiveObjects();
        if (activeObjects.length > 0) {
            e.preventDefault();
            this.deleteObjects(activeObjects);
        }
    }

    private deleteObjects(objects: FabricObject[]): void {
        if (!this.canvas) return;

        objects.forEach(obj => this.canvas?.remove(obj));
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();

        if (!this.isRemoteUpdate) {
            const ids = objects
                .map(obj => (obj as any).id)
                .filter(Boolean);

            if (ids.length > 0) {
                ws.send({
                    type: 'whiteboard-update',
                    data: { type: 'delete', ids },
                });
            }
        }
    }

    private handleSpaceKeyDown(): void {
        this.isSpaceDown = true;
        if (this.canvas) {
            this.canvas.defaultCursor = 'grab';
        }
    }

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (e.code === 'Space') {
            this.handleSpaceKeyUp();
        }
    };

    private handleSpaceKeyUp(): void {
        this.isSpaceDown = false;
        this.isPanning = false;
        
        if (this.canvas) {
            this.canvas.defaultCursor = 'default';
        }
        
        this.setTool(this.currentTool);
    }

    setTool(tool: string): void {
        this.currentTool = tool;
        if (!this.canvas) return;

        switch (tool) {
            case 'select':
                this.configureSelectTool();
                break;
            case 'pen':
                this.configurePenTool();
                break;
            case 'highlighter':
                this.configureHighlighterTool();
                break;
            case 'eraser':
                this.configureEraserTool();
                break;
            case 'text':
                this.configureTextTool();
                break;
        }
        
        this.canvas.requestRenderAll();
    }

    private configureSelectTool(): void {
        if (!this.canvas) return;
        this.canvas.isDrawingMode = false;
        this.canvas.selection = true;
    }

    private configurePenTool(): void {
        if (!this.canvas?.freeDrawingBrush) return;
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush.width = this.brushSize;
        this.canvas.freeDrawingBrush.color = this.color;
    }

    private configureHighlighterTool(): void {
        if (!this.canvas?.freeDrawingBrush) return;
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush.width = Math.max(
            CONSTANTS.BRUSH.HIGHLIGHTER_MIN,
            this.brushSize * CONSTANTS.BRUSH.HIGHLIGHTER_MULTIPLIER
        );
        this.canvas.freeDrawingBrush.color = this.hexToRgba(
            this.color,
            CONSTANTS.BRUSH.HIGHLIGHTER_ALPHA
        );
    }

    private configureEraserTool(): void {
        if (!this.canvas?.freeDrawingBrush) return;
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush.width = Math.max(
            CONSTANTS.BRUSH.ERASER_MIN,
            this.brushSize * CONSTANTS.BRUSH.ERASER_MULTIPLIER
        );
        this.canvas.freeDrawingBrush.color = 'white';
    }

    private configureTextTool(): void {
        if (!this.canvas) return;
        this.canvas.isDrawingMode = false;
        this.canvas.selection = false;
    }

    setBrushSize(size: number): void {
        this.brushSize = size;
        if (this.canvas?.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.width = size;
        }
    }

    getBrushSize(): number {
        return this.brushSize;
    }

    setColor(color: string): void {
        this.color = color;
        this.setTool(this.currentTool);
    }

    downloadImage(): void {
        if (!this.canvas) return;

        const dataURL = this.canvas.toDataURL({
            format: CONSTANTS.EXPORT.FORMAT,
            quality: CONSTANTS.EXPORT.QUALITY,
            multiplier: CONSTANTS.EXPORT.MULTIPLIER,
        });

        const link = document.createElement('a');
        link.download = `${CONSTANTS.EXPORT.FILENAME_PREFIX}-${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    private hexToRgba(hex: string, alpha: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    private generateId(): string {
        return crypto.randomUUID();
    }

    private setupCanvasListeners(): void {
        if (!this.canvas) return;

        this.canvas.on('mouse:wheel', this.handleMouseWheel.bind(this));
        this.canvas.on('path:created', this.handlePathCreated.bind(this));
        this.canvas.on('object:modified', this.handleObjectModified.bind(this));
        this.canvas.on('mouse:down', this.handleMouseDown.bind(this));
        this.canvas.on('mouse:move', this.handleMouseMove.bind(this));
        this.canvas.on('mouse:up', this.handleMouseUp.bind(this));
        this.canvas.on('text:changed', this.handleTextChanged.bind(this));
        this.canvas.on('text:editing:entered', this.handleTextEditingEntered.bind(this));
    }

    private handleMouseWheel(opt: any): void {
        if (!this.canvas) return;

        const e = opt.e as WheelEvent;
        let zoom = this.canvas.getZoom();
        zoom *= CONSTANTS.ZOOM.FACTOR ** e.deltaY;
        zoom = Math.min(CONSTANTS.ZOOM.MAX, Math.max(CONSTANTS.ZOOM.MIN, zoom));

        const zoomPoint = this.canvas.getViewportPoint(e);
        this.canvas.zoomToPoint(new Point(zoomPoint.x, zoomPoint.y), zoom);

        e.preventDefault();
        e.stopPropagation();
    }

    private handlePathCreated(e: any): void {
        if (this.isRemoteUpdate || !e.path) return;

        e.path.set('id', this.generateId());
        ws.send({
            type: 'whiteboard-update',
            data: { type: 'path', obj: e.path.toObject(['id'] as any) },
        });
    }

    private handleObjectModified(e: ObjectModifiedEvent): void {
        if (this.isRemoteUpdate || !e.target) return;

        ws.send({
            type: 'whiteboard-update',
            data: { type: 'modify', obj: e.target.toObject(['id']) },
        });
    }

    private handleMouseDown(o: any): void {
        if (!this.canvas) return;

        if (this.isSpaceDown) {
            this.startPanning(o);
            return;
        }

        this.handleTextDeselection(o);

        if (this.currentTool === 'text' && !this.isRemoteUpdate && !o.target) {
            this.createTextObject(o);
        }
    }

    private startPanning(o: any): void {
        if (!this.canvas) return;

        this.isPanning = true;
        this.lastPanX = o.e.clientX;
        this.lastPanY = o.e.clientY;
        this.canvas.defaultCursor = 'grabbing';
        this.canvas.selection = false;
        this.canvas.isDrawingMode = false;
        this.canvas.discardActiveObject();
    }

    private handleTextDeselection(o: any): void {
        if (!this.canvas) return;

        const activeObj = this.canvas.getActiveObject();
        if (activeObj?.type === 'IText' && o.target !== activeObj) {
            (activeObj as IText).exitEditing();
            this.canvas.discardActiveObject();
            this.canvas.requestRenderAll();
        }
    }

    private createTextObject(o: any): void {
        if (!this.canvas) return;

        const pointer = this.canvas.getScenePoint(o.e);
        const text = new IText(CONSTANTS.TEXT.DEFAULT_CONTENT, {
            left: pointer.x,
            top: pointer.y,
            fill: this.color,
            fontSize: CONSTANTS.TEXT.DEFAULT_SIZE,
            fontFamily: CONSTANTS.TEXT.DEFAULT_FONT,
        });

        text.set('id', this.generateId());
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();

        this.setTool('select');

        ws.send({
            type: 'whiteboard-update',
            data: { type: 'add', obj: text.toObject(['id'] as any) },
        });
    }

    private handleMouseMove(o: any): void {
        if (!this.canvas || !this.isPanning) return;

        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;

        const dx = o.e.clientX - this.lastPanX;
        const dy = o.e.clientY - this.lastPanY;

        vpt[4] += dx;
        vpt[5] += dy;

        this.lastPanX = o.e.clientX;
        this.lastPanY = o.e.clientY;

        this.canvas.requestRenderAll();
    }

    private handleMouseUp(): void {
        if (!this.canvas || !this.isPanning) return;

        this.isPanning = false;
        this.canvas.defaultCursor = this.isSpaceDown ? 'grab' : 'default';
    }

    private handleTextChanged(e: any): void {
        if (this.isRemoteUpdate || !e.target) return;

        ws.send({
            type: 'whiteboard-update',
            data: { type: 'modify', obj: e.target.toObject(['id']) },
        });
    }

    private handleTextEditingEntered(e: any): void {
        if (!e.target || e.target.type !== 'IText') return;

        const textObj = e.target as IText;
        if ((textObj as any).__customKeyDownBound) return;

        if (textObj.hiddenTextarea) {
            const handler = (ev: KeyboardEvent) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    textObj.exitEditing();
                    this.canvas?.discardActiveObject();
                    this.canvas?.requestRenderAll();
                    this.setTool('select');
                }
            };

            textObj.hiddenTextarea.addEventListener('keydown', handler);
            (textObj as any).__customKeyDownBound = true;

            this.eventCleanupFunctions.push(() => {
                textObj.hiddenTextarea?.removeEventListener('keydown', handler);
            });
        }
    }

    private setupSocketListeners(): void {
        ws.on('whiteboard-start', this.handleWhiteboardStart.bind(this));
        ws.on('whiteboard-stop', this.handleWhiteboardStop.bind(this));
        ws.on('whiteboard-update', this.handleWhiteboardUpdate.bind(this));
        ws.on('whiteboard-cursor', this.handleWhiteboardCursor.bind(this));
        ws.on('user-left', this.handleUserLeft.bind(this));
    }

    private handleWhiteboardStart(msg: any): void {
        state.setIsWhiteboarding(true);
        state.setSharer(msg.sender, null);
        document.dispatchEvent(
            new CustomEvent('whiteboard:started', { detail: { sender: msg.sender } })
        );
    }

    private handleWhiteboardStop(): void {
        state.setIsWhiteboarding(false);
        state.setSharer(null, null);
        document.dispatchEvent(new CustomEvent('whiteboard:stopped'));
        this.clear();
    }

    private async handleWhiteboardUpdate(msg: any): Promise<void> {
        if (!this.canvas || msg.sender === state.userId) return;

        console.log('RX Whiteboard Update:', msg);

        this.isRemoteUpdate = true;
        try {
            const { type, obj, ids } = msg.data;

            switch (type) {
                case 'path':
                case 'add':
                    await this.handleRemoteAdd(obj);
                    break;
                case 'delete':
                    this.handleRemoteDelete(ids);
                    break;
                case 'clear':
                    this.clear();
                    break;
            }
        } catch (err) {
            console.error('Whiteboard update failed:', err);
        } finally {
            this.isRemoteUpdate = false;
        }
    }

    private async handleRemoteAdd(obj: any): Promise<void> {
        if (!this.canvas) return;

        const enlivened = (await util.enlivenObjects([obj])) as unknown as FabricObject[];
        enlivened.forEach(fabricObj => this.canvas?.add(fabricObj));
        this.canvas.renderAll();
    }

    private handleRemoteDelete(ids: string[]): void {
        if (!this.canvas || !ids) return;

        this.canvas.getObjects().forEach(obj => {
            if (ids.includes((obj as any).id)) {
                this.canvas?.remove(obj);
            }
        });

        this.canvas.discardActiveObject();
        this.canvas.renderAll();
    }

    private handleWhiteboardCursor(msg: any): void {
        if (msg.sender === state.userId) return;

        const { x, y } = msg.data;
        const username = msg.username || 'Unknown';
        this.updateRemoteCursor(msg.sender, x, y, username);
    }

    private handleUserLeft(msg: any): void {
        this.removeRemoteCursor(msg.userId);
    }

    start(): void {
        ws.send({ type: 'whiteboard-start' });
        state.setIsWhiteboarding(true);
    }

    stop(): void {
        ws.send({ type: 'whiteboard-stop' });
        state.setIsWhiteboarding(false);
        this.saveState();
        this.destroy();
    }

    clear(): void {
        if (!this.canvas) return;

        this.canvas.clear();
        this.canvas.backgroundColor = 'white';
        this.canvas.renderAll();
    }

    remoteClear(): void {
        ws.send({
            type: 'whiteboard-update',
            data: { type: 'clear' },
        });
        this.clear();
    }

    private saveState(): void {
        if (!this.canvas) return;

        const objects = this.canvas.getObjects();
        const serialized = objects.map(obj => obj.toObject());
        state.setWhiteboardData(serialized);
    }

    private async restoreState(): Promise<void> {
        if (!this.canvas) return;

        const savedData = state.whiteboardData;
        if (!savedData || savedData.length === 0) return;

        this.isRemoteUpdate = true;
        try {
            for (const objData of savedData) {
                const fabricObj = await (FabricObject as any).fromObject(objData);
                if (fabricObj) {
                    this.canvas.add(fabricObj);
                }
            }
            this.canvas.renderAll();
        } catch (err) {
            console.error('Failed to restore whiteboard state:', err);
        } finally {
            this.isRemoteUpdate = false;
        }
    }

    private setupCursorContainer(): void {
        if (!this.container) return;

        this.cursorContainer = document.createElement('div');
        Object.assign(this.cursorContainer.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '100',
        });

        this.container.appendChild(this.cursorContainer);
    }

    private setupCursorTracking(): void {
        if (!this.canvas) return;

        let pendingCursorPos: { x: number; y: number } | null = null;
        let rafId: number | null = null;
        let lastSendTime = 0;

        const sendCursorUpdate = () => {
            rafId = null;
            if (!pendingCursorPos || !this.canvas) return;

            const now = performance.now();
            if (now - lastSendTime < CONSTANTS.CURSOR.UPDATE_INTERVAL) {
                rafId = requestAnimationFrame(sendCursorUpdate);
                return;
            }

            lastSendTime = now;
            ws.send({
                type: 'whiteboard-cursor',
                data: { x: pendingCursorPos.x, y: pendingCursorPos.y },
            });
            pendingCursorPos = null;
        };

        this.canvas.on('mouse:move', (o: any) => {
            if (!this.canvas) return;

            const pointer = this.canvas.getScenePoint(o.e);
            pendingCursorPos = { x: pointer.x, y: pointer.y };

            if (!rafId) {
                rafId = requestAnimationFrame(sendCursorUpdate);
            }
        });
    }

    private updateRemoteCursor(
        userId: string,
        x: number,
        y: number,
        username: string
    ): void {
        if (!this.cursorContainer) return;

        let cursor = this.remoteCursors.get(userId);

        if (!cursor) {
            const element = this.createCursorElement(username);
            this.cursorContainer.appendChild(element);
            cursor = { x, y, username, element };
            this.remoteCursors.set(userId, cursor);
        }

        cursor.x = x;
        cursor.y = y;
        cursor.element.style.transform = `translate(${x}px, ${y}px)`;
    }

    private createCursorElement(username: string): HTMLElement {
        const element = document.createElement('div');
        Object.assign(element.style, {
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: '100',
            transition: `transform ${CONSTANTS.CURSOR.TRANSITION_DURATION} ease-out`,
        });

        element.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="#3b82f6" stroke="white" stroke-width="2"/>
            </svg>
            <span style="
                position: absolute;
                top: 16px;
                left: 12px;
                background: #3b82f6;
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                white-space: nowrap;
            ">${username}</span>
        `;

        return element;
    }

    private removeRemoteCursor(userId: string): void {
        const cursor = this.remoteCursors.get(userId);
        if (cursor) {
            cursor.element.remove();
            this.remoteCursors.delete(userId);
        }
    }

    destroy(): void {
        this.saveState();

        this.eventCleanupFunctions.forEach(cleanup => cleanup());
        this.eventCleanupFunctions = [];

        this.remoteCursors.forEach(cursor => cursor.element.remove());
        this.remoteCursors.clear();

        if (this.cursorContainer) {
            this.cursorContainer.remove();
            this.cursorContainer = null;
        }

        this.canvas = null;
        this.container = null;
        this.toolbar = null;
    }
}

export const whiteboard = new WhiteboardManager();