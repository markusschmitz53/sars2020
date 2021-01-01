import "./style.scss";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    Mesh,
    MeshBuilder,
    StandardMaterial, Color3, HighlightLayer, FreeCamera, Camera, Color4
} from "@babylonjs/core";

class App {
	constructor() {
        // create the canvas html element and attach it to the webpage
        var canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);
        // initialize babylon scene and engine
        var engine = new Engine(canvas, true);
        var scene = new Scene(engine);
        scene.clearColor = new Color4(0, 0, 0, 1);
        var camera = new FreeCamera("camera1", new Vector3(0, 100, 0.1), scene);
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        var distance = 10;
        var aspect = scene.getEngine().getRenderingCanvasClientRect().height / scene.getEngine().getRenderingCanvasClientRect().width;

        camera.orthoLeft = -distance / 2;
        camera.orthoRight = distance / 2;
        camera.orthoBottom = camera.orthoLeft * aspect;
        camera.orthoTop = camera.orthoRight * aspect;
        camera.setTarget(new Vector3(0, 0, 0))

        var light1 = new HemisphericLight("light1", new Vector3(1, 1, 0), scene);

        for (let i = 0; i < 1; i++) {
            this.drawCase();
        }

        // hide/show the Inspector
        window.addEventListener("keydown", (ev) => {
            // Ctrl+Alt+I
            if (ev.ctrlKey && ev.altKey && ev.keyCode === 73) {
                if (scene.debugLayer.isVisible()) {
                    scene.debugLayer.hide();
                } else {
                    scene.debugLayer.show();
                }
            }
        });
        // run the main render loop
        engine.runRenderLoop(() => {
            scene.render();
        });
    }

    drawCase() {
	    var cylinder = MeshBuilder.CreateCylinder("cylinder", {height: 0.1, diameterTop: 0.1, diameterBottom: 0.1, tessellation: 96});

	    var x = Math.ceil(Math.random() * 3) * (Math.round(Math.random()) ? 1 : -1);
	    var z = Math.ceil(Math.random() * 3) * (Math.round(Math.random()) ? 1 : -1);

	    console.log(x,z)

        cylinder.position.x = x;
        cylinder.position.z = z;
    }
}
new App();
