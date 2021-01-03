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
    Animation,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Camera,
    Color4,
    VertexData,
    ParticleSystem,
    Texture,
    NoiseProceduralTexture,
    GPUParticleSystem, KeyboardEventTypes, CubicEase, EasingFunction
} from "@babylonjs/core";
import {getJSON} from '../node_modules/simple-get-json/dist/index-es.js';
import * as d3 from "d3";
import * as d3Geo from 'd3-geo-projection';
import * as earcut from "earcut"
import {ExtendedGeometryCollection} from "d3";
import {LoadingScreen} from "./LoadingScreen";

export interface GeometryCollection extends ExtendedGeometryCollection {
    length: number;
    pop;
    forEach;
    slice;
    reverse;
}

export class CustomCamera extends ArcRotateCamera {
    spinTo(whichprop, targetval, speed) {
        let ease = new CubicEase();
        ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
        Animation.CreateAndStartAnimation('at4', this, whichprop, speed, 120, this[whichprop], targetval, 0, ease);
    }
}

class App {
    private readonly covidDataUrl: string;
    private readonly countiesDataUrl: string;
    private countyCount: number;
    private counties: GeometryCollection;
    private covidCases: any;
    private drawnCounties;
    private radius: number;
    private scene;
    private camera;
    private geoBoundsForCounties;
    private engine;
    private performanceValueT0;

	constructor() {
	    this.covidDataUrl = 'https://opendata.arcgis.com/datasets/9644cad183f042e79fb6ad00eadc4ecf_0.geojson';
	    this.countiesDataUrl = 'https://markusschmitz.info/landkreise_deutschland.json';
	    this.drawnCounties = {};

        // create the canvas html element and attach it to the webpage
        let canvas = document.createElement("canvas");
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);
        // initialize babylon scene and engine
        let engine = new Engine(canvas, true);
        let scene = new Scene(engine);
        this.scene = scene;
        this.engine = engine;

        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        scene.clearColor = new Color4(0, 0, 0, 1);
        this.radius = 160;

        let light = new HemisphericLight(
            'light1',
            new Vector3(0, 1, 0),
            scene,
        );
        light.intensity = 1;

        let camera = new CustomCamera(
            'Camera',
            -Math.PI / 2,
            Math.PI / 2,
            this.radius,
            Vector3.Zero(),
            scene,
        ); // -pi/2, pi/2 gives you camera that looks into Z with Y up and X right
        camera.speed = 30000;
        camera.panningSensibility = 30;
        camera.inertia = 0;
        camera.minZ = 0;
        camera.attachControl(canvas, false);
        this.camera = camera;

        this.startProcess('Start: loading counties');
        engine.loadingScreen = new LoadingScreen("preparing data");
        engine.displayLoadingUI();

        getJSON([this.countiesDataUrl]).then((records) => {
            if (!records) {
                console.error('no county records');
                return;
            } else if (!records.length || !records[0].features) {
                console.error('wrong data structure for counties');
                return;
            }

            let data = records[0];

            this.geoBoundsForCounties = d3.geoBounds(data);
            this.counties = data;

            this.stopProcess('End: loading counties');
            this.countyCount = 0;
            this.drawCounties();
        }, (error) => {
            console.error('error', error);
        });

        scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN:
                    switch (kbInfo.event.key) {
                        case " ":
                            this.drawCases();
                    }
                    break;
            }
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

    sortCasesByDate(a, b) {
        return (a.properties.Meldedatum < b.properties.Meldedatum) ? -1 : ((a.properties.Meldedatum > b.properties.Meldedatum) ? 1 : 0);
    }

    drawCases() {
	    this.startProcess('Start: loading cases');
        getJSON([this.covidDataUrl]).then((records: GeometryCollection) => {
            if (!records) {
                console.error('failed to load covid records');
                return;
            } else if (!records.length || !records[0].features) {
                console.error('wrong data structure for covid records');
                return;
            }

            let data = records[0],
            sortedData = [],
            date,
            feature;

            data = data.features.sort(this.sortCasesByDate);

            // skip first days of January as cases only started 28.01.2020
            for (let i = 8000; i < data.length; i++) {
                feature = data[i];
                date = feature.properties.Meldedatum.substring(0, 10);
                if (!sortedData[date]) {
                    sortedData[date] = [];
                }

                sortedData[date].push(feature);
            }

            setTimeout(() => this.camera.spinTo('beta', 2.62, 20), 0);
            setTimeout(() => this.camera.spinTo('radius', 149, 20), 2000);

            this.covidCases = sortedData;
            this.drawCaseMeshes();
	        this.stopProcess('End: loading cases');
        }, (error) => {
            console.error('error', error);
        });
    }

    getCountyKey(_raw) {
	    let countyKey = parseInt(_raw, 10);
	    switch (countyKey) {
	        // Bezirke Berlin
            case 11001:
            case 11002:
            case 11003:
            case 11004:
            case 11005:
            case 11006:
            case 11007:
            case 11008:
            case 11009:
            case 11010:
            case 11011:
            case 11012:
                countyKey = 11000;
        }
	    return countyKey;
    }

    drawNextDayCases(_cases) {
	    return this.sleep(0).then(() => {
	        for (let i = 0; i < _cases.length; i++) {
	            this.drawNextCaseMesh(_cases[i]);
            }
	        return true;
        });
    }

    drawNextCaseMesh(covidCase) {
        let countyKey = this.getCountyKey(covidCase.properties.IdLandkreis),
            county = this.drawnCounties[countyKey],
            particleSystem = county.particleSystem,
            boundingBoxCenter = county.center,
            cases = parseInt(covidCase.properties.AnzahlFall, 10);

        if (cases < 1) {
            return;
        }

        if (!county) {
            console.error('no drawn county for key: ' + countyKey);
            return; // continue;
        }

        particleSystem.emitter = this.getRandomPosition(boundingBoxCenter.x, boundingBoxCenter.y, -1);
        this.drawnCounties[countyKey].particleSystem.manualEmitCount = cases;
        /*
            setTimeout(() => {

            }, Math.floor(Math.random() * (1 - 1 + 1) + 1));
        */
    }

    sleep(ms: number) {
        return new Promise(resolve => {
                setTimeout(resolve, ms);
            }
        );
    }

    async drawCaseMeshes() {
	    this.startProcess('Start: drawing cases');
        let currentDayDomElement = document.getElementById('currentDay'),
            covidCases = this.covidCases,
            timestamp,
            timeMax = 200,
            executionTime,
            dateGroup;

        if (!currentDayDomElement) {
            currentDayDomElement = document.createElement("div");
            currentDayDomElement.setAttribute("id", "currentDay");
            document.body.appendChild(currentDayDomElement);
	    }

       for (let date in covidCases) {
           timestamp = performance.now();
           dateGroup = covidCases[date];
           document.getElementById('currentDay').innerHTML = date;
           await this.drawNextDayCases(dateGroup);
           executionTime = performance.now() - timestamp;
           if (executionTime < timeMax) {
               await this.sleep(timeMax - executionTime);
           }
        }
        console.info('Max execution time for particle drawing: ' + timeMax);
        this.stopProcess('End: drawing cases');
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
            ++this.countyCount;

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
                        console.log('Failed to extract data')
                        return;
                    }

                    extractionResult.push(tempExtractedData);
                });
            } else {
                extractionResult.push(this.extractPositionsAndIndexes(flattenedGeometry));
            }

            let countyMeshgroup = [],
            countyAgs, countyLabel = '';
            extractionResult.forEach((extractedData) => {
                if (extractedData && extractedData.indices && extractedData.indices.length) {
                    let mesh = this.getCountyMesh(extractedData);
                    if (mesh) {
                        countyAgs = extractedData.stateAgs;
                        countyLabel = extractedData.stateLabel;
                        meshGroup.push(mesh);
                        countyMeshgroup.push(mesh);
                    }
                } else {
                    console.error('missing extracted data for: ' + state)
                }
            });

            if (countyAgs) {
                let boundingBox = this.getMeshgroupBoundingBox(countyMeshgroup),
                    center = boundingBox.centerWorld;

                if (this.drawnCounties[countyAgs]) {
                    console.error('Overwriting drawn county: ' + countyAgs, properties, this.drawnCounties[countyAgs].properties);
                }
                this.drawnCounties[countyAgs] = {
                    county: countyLabel,
                    center: center,
                    properties: properties,
                    particleSystem: this.drawParticleSystem(center.x, center.y)
                }
            } else {
                console.error('Missing ags', state);
            }
        }

        let numberOfDrawnCounties = Object.keys(this.drawnCounties).length;
        if (numberOfDrawnCounties !== this.countyCount) {
            console.error('Wrong drawn county count: ' + numberOfDrawnCounties + '/' + this.countyCount);
        }

        console.info('drawing ' + counties.length + ' counties as ' + meshGroup.length + ' meshes');

        let boundingBox = this.getMeshgroupBoundingBox(meshGroup);

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
        let distance = (height / 1.75 / aspectRatio) / Math.tan(fov / 2);

        this.camera.setTarget(centerWorld);
        this.camera.setPosition(new Vector3(centerWorld.x, centerWorld.y, centerWorld.z - distance));
    }

    getMeshgroupBoundingBox(_meshgroup: Mesh[]) {
        let meshGroupClone = [];
        for (let i = 0; i < _meshgroup.length; i++) {
            meshGroupClone.push(_meshgroup[i].clone("clone"));
        }

        // merge all created meshes to one group to get the bounding box
        let mergedMesh = Mesh.MergeMeshes(meshGroupClone, true, true);

        for (let k = meshGroupClone.length; k > 0; k--) {
            meshGroupClone[k - 1].dispose();
        }

        mergedMesh.isVisible = false;

        let {boundingBox} = mergedMesh.getBoundingInfo();
        mergedMesh.dispose();
        return boundingBox;
    }

    drawParticleSystem(_positionX, _positionY) {
        let particleSystemInstance = new ParticleSystem("particles", 100, this.scene);
        /*
            if (GPUParticleSystem.IsSupported) {
                myParticleSystem = new GPUParticleSystem("particles", {capacity: 100}, this.scene);
            } else {
                myParticleSystem = new ParticleSystem("particles", 100, this.scene);
            }
        */

        particleSystemInstance.particleTexture = new Texture("https://markusschmitz.info/Flare.png", this.scene);
        particleSystemInstance.emitter = new Vector3(_positionX, _positionY, -0.5);
        particleSystemInstance.emitRate = 2;
        particleSystemInstance.updateSpeed = 0.01;
        particleSystemInstance.minSize = 0.15;
        particleSystemInstance.maxSize = 0.3;
        particleSystemInstance.addColorGradient(0, new Color4(1, 1, 1, 0)); //color at start of particle lifetime
        particleSystemInstance.addColorGradient(1, new Color4(1, 1, 1, 1)); //color at end of particle lifetime
        particleSystemInstance.minEmitPower = 0.1;
        particleSystemInstance.maxEmitPower = 1;
        particleSystemInstance.minLifeTime = 0.5;
        particleSystemInstance.maxLifeTime = 2;
        particleSystemInstance.direction1 = new Vector3(0, 0, -10);
        particleSystemInstance.manualEmitCount = 0;
        particleSystemInstance.start();
        //myParticleSystem.disposeOnStop = true;

        return particleSystemInstance;
    }

    getRandomPosition(_positionX, _positionY, _positionZ): Vector3 {
        let randomValue1 = (Math.random() * (0.08 - 0.001) + 0.08),
            randomValue2 = (Math.random() * (0.08 - 0.001) + 0.08);

        _positionX += (Math.random() < 0.5 ? -1 : 1) * randomValue1;
        _positionY += (Math.random() < 0.5 ? -1 : 1) * randomValue2;

        return new Vector3(_positionX, _positionY, _positionZ);
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

window.onload = function () {
    new App();
};
