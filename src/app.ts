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
    StandardMaterial, Color3, Camera, Color4, VertexData
} from "@babylonjs/core";
import {getJSON} from '../node_modules/simple-get-json/dist/index-es.js';
import * as d3 from "d3";
import * as d3Geo from 'd3-geo-projection';
import * as earcut from "earcut"
import {ExtendedGeometryCollection} from "d3";
import {LoadingScreen} from "./LoadingScreen";

export interface GeometryCollection extends ExtendedGeometryCollection {
    length: number;
}

class App {
    private counties: GeometryCollection;
    private drawnCounties;
    private radius: number;
    private scene;
    private camera;
    private geoBoundsForCounties;
    private engine;
    private performanceValueT0;

	constructor() {
	    this.drawnCounties = {};

        // create the canvas html element and attach it to the webpage
        var canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);
        // initialize babylon scene and engine
        var engine = new Engine(canvas, true);
        var scene = new Scene(engine);
        this.scene = scene;
        this.engine = engine;
        scene.clearColor = new Color4(0, 0, 0, 1);
        this.radius = 1000;

        var light = new HemisphericLight(
            'light1',
            new Vector3(0, 1, 0),
            scene,
        );
        light.intensity = 1;

        var camera = new ArcRotateCamera(
            'Camera',
            -Math.PI / 2,
            Math.PI / 2,
            700,
            new Vector3(500, -300, 0),
            scene,
        ); // -pi/2, pi/2 gives you camera that looks into Z with Y up and X right
        this.camera = camera;
        camera.speed = 30000;
        camera.panningSensibility = 30;
        camera.inertia = 0;
        camera.minZ = 0;
        camera.attachControl(canvas, false);

        let dataUrl = 'https://markusschmitz.info/landkreise_deutschland.json';

        this.startProcess('Start: loading data');
        engine.loadingScreen = new LoadingScreen("preparing data");
        engine.displayLoadingUI();

        getJSON([dataUrl]).then((records) => {
            // Do something with "objsArr" array
            if (!records) {
                console.error('no records');
                return;
            } else if (!records.length || !records[0].features) {
                console.error('wrong data structure');
                return;
            }

            let data = records[0];

            this.geoBoundsForCounties = d3.geoBounds(data);
            this.counties = data;

            this.stopProcess('End: loading data');
            this.drawCounties();
        }, (error) => {
            // Handle any errors here
            console.error('error', error);
        });

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

    startProcess(_hint) {
	    console.info(_hint);
	    this.performanceValueT0 = performance.now();
    }

    stopProcess(_hint) {
	    let timeValue = ((performance.now() - this.performanceValueT0) / 1000).toFixed(1);
	    _hint += ' (' + timeValue + 's)';
	    console.info(_hint);
    }

    /**
     * @see https://observablehq.com/@sto3psl/map-of-germany-in-d3-js
     */
    getProjection() {
        let bounds = this.geoBoundsForCounties,
            bottomLeft = bounds[0],
            topRight = bounds[1],
            rotLong = -(topRight[0] + bottomLeft[0]) / 2,
            centerX = (topRight[0] + bottomLeft[0]) / 2 + rotLong,
            centerY = (topRight[1] + bottomLeft[1]) / 2;

        return d3.geoAlbers()
        //    .parallels([bottomLeft[1], topRight[1]])
            .rotate([rotLong, 0, 0])
            //.translate([width / 100, height / 100])
            .center([centerX, centerY]);
    }

    drawCounties() {
        if (!this.counties) {
            return;
        }

        this.startProcess('Start: projecting GeoJSON');
        // project the lat and long values from GeoJSON to pixel values
        let counties = d3Geo.geoProject(this.counties, this.getProjection());

        // projected values are in the wrong orientation for displaying on canvas so we flip them
        counties = d3Geo.geoProject(counties, d3.geoIdentity().reflectY(true));
        counties = counties.features;

        this.stopProcess('End: projecting GeoJSON');

        this.startProcess('Start: generating meshes');
        let meshGroup = [],
        i, feature, geometry, properties, state, stateAgs, flattenedGeometry;
        for (i = 0; i < counties.length; i++) {
            feature = counties[i];
            geometry = counties[i].geometry;
            properties = feature.properties;

            if (!properties || !properties.GEN || !properties.AGS) {
                console.error(feature);
                throw new Error('Missing properties on feature');
            }
            state = properties.GEN;
            stateAgs = parseInt(properties.AGS, 10); // places 1-2 state, places 3-5 for county

            if (feature.geometry.type === 'MultiPolygon') {
                flattenedGeometry = geometry.coordinates.map((coord, i) => {
                    return {...earcut.flatten(coord), stateAgs: stateAgs, id: `${state}-${i}`, stateLabel: state};
                });
            } else {
                flattenedGeometry = {
                    ...earcut.flatten(geometry.coordinates),
                    stateAgs: stateAgs,
                    id: `${state}-0`,
                    stateLabel: state
                };
            }

            if (!flattenedGeometry) {
                throw new Error('Missing flattened geometry');
            }

            let extractionResult = [];
            if (Array.isArray(flattenedGeometry)) {
                flattenedGeometry.forEach((_geometry) => {
                    let tempExtractedData = this.extractPositionsAndIndexes(_geometry);

                    if (!tempExtractedData.indices.length) {
                        return;
                    }

                    extractionResult.push(tempExtractedData);
                });
            } else {
                extractionResult.push(this.extractPositionsAndIndexes(flattenedGeometry));
            }

            let countyMeshgroup = [],
            countyAgs, countyLabel;
            extractionResult.forEach((extractedData) => {
                if (extractedData && extractedData.indices && extractedData.indices.length) {
                    let mesh = this.getCountyMesh(extractedData);
                    countyAgs = extractedData.stateAgs;
                    countyLabel = extractedData.stateLabel;
                    this.drawnCounties.stateAgs
                    if (mesh) {
                        meshGroup.push(mesh);
                        countyMeshgroup.push(mesh);
                    }
                } else {
                    console.error('missing extracted data for: ' + state)
                }
            });

            if (countyAgs) {
                let meshGroupClone = [];
                for (let i = 0; i < countyMeshgroup.length; i++) {
                    meshGroupClone.push(countyMeshgroup[i].clone("clone"));
                }
                let mergedCountyMesh = Mesh.MergeMeshes(meshGroupClone, true, true);
                for (let k = meshGroupClone.length; k > 0; k--) {
                    meshGroupClone[k - 1].dispose();
                }

                let {boundingBox} = mergedCountyMesh.getBoundingInfo(),
                center = boundingBox.centerWorld;
                this.drawnCounties[countyAgs] = {
                    county: countyLabel,
                    center: center
                }
                this.drawSphere(new Vector3(center.x, center.y, -4));
            }
        }

        console.info('drawing ' + counties.length + ' counties as ' + meshGroup.length + ' meshes');

        let meshGroupClone = [];
        for (let i = 0; i < meshGroup.length; i++) {
            meshGroupClone.push(meshGroup[i].clone("clone"));
        }

        // merge all created meshes to one group to get the bounding box
        let mergedMesh = Mesh.MergeMeshes(meshGroupClone, true, true);

        for (let k = meshGroupClone.length; k > 0; k--) {
            meshGroupClone[k - 1].dispose();
        }

        mergedMesh.isVisible = false;

        let {boundingBox} = mergedMesh.getBoundingInfo();
        mergedMesh.dispose();

        this.stopProcess('End: generating meshes');
        this.engine.hideLoadingUI();

        // get min and max boundaries
        let minX = boundingBox.minimumWorld.x;
        let minY = boundingBox.minimumWorld.y;
        let maxX = boundingBox.maximumWorld.x;
        let maxY = boundingBox.maximumWorld.y;
        let {centerWorld} = boundingBox;
        let height = maxY - minY;
        let fov = this.camera.fov;
        let aspectRatio = this.engine.getAspectRatio(this.camera);
        let distance = (height / 1.25 / aspectRatio) / Math.tan(fov / 2);

        this.camera.setTarget(centerWorld);
        this.camera.setPosition(new Vector3(centerWorld.x, centerWorld.y, centerWorld.z - distance));
    }

    extractPositionsAndIndexes(_geometry) {
        let coordinates = [].slice.apply(_geometry.vertices);

        if (
            coordinates[0] === coordinates[coordinates.length - 2] &&
            coordinates[1] === coordinates[coordinates.length - 1]
        ) {
            coordinates.pop();
            coordinates.pop();
        }

        let indices = earcut(coordinates, _geometry.holes, _geometry.dimensions);

        // add a z coordinate for all points
        let zCoordinate = 0;

        for (let i = 2; i < coordinates.length; i += 3) {
            coordinates.splice(i, 0, zCoordinate);
        }
        coordinates.splice(coordinates.length, 0, zCoordinate);

        return {
            positions: coordinates,
            indices,
            stateLabel: _geometry.stateLabel,
            stateAgs: _geometry.stateAgs
        };
    }

    getCountyMesh(_corners) {
        if (!_corners || !_corners.positions || !_corners.indices) {
            console.error(_corners);
            throw new Error('wrong corner data');
        }

        let customMesh = new Mesh('poly', this.scene);
        let vertexData = new VertexData();

        vertexData.positions = _corners.positions;
        vertexData.indices = _corners.indices;

        vertexData.applyToMesh(customMesh, true);

        let mat = new StandardMaterial(`1-mat`, this.scene);

        let randomColor = Color3.Black();
        mat.diffuseColor = randomColor;
        mat.emissiveColor = randomColor;

        randomColor = Color3.White();
        customMesh.enableEdgesRendering();
        customMesh.edgesWidth = 10.0;
        customMesh.edgesColor = new Color4(randomColor.r, randomColor.g, randomColor.b, 0.75);

        customMesh.material = mat;

        return customMesh;
    }

    drawCase(_corners) {
	    if (!_corners || !_corners.length) {
	        throw new Error('missing coroners');
        }
        const polygon = MeshBuilder.CreatePolygon("poly", _corners);
    }

    drawSphere(_positionVector: Vector3) {
        const sphere = MeshBuilder.CreateSphere("sphere", {
            diameter: 0.5
        });
        let mat = new StandardMaterial(`spheremat`, this.scene);
        let randomColor = Color3.White();
        mat.alpha = 0.75;
        mat.diffuseColor = randomColor;
        mat.emissiveColor = randomColor;
        sphere.material = mat;

        sphere.position = _positionVector;
    }
}
new App();
