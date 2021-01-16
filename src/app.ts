import './style.scss';
import '@babylonjs/core/Debug/debugLayer';
import '@babylonjs/inspector';
import '@babylonjs/loaders/glTF';
import {
    Engine,
    Scene,
    Vector3,
    HemisphericLight,
    Mesh,
    StandardMaterial,
    Color3,
    Camera,
    Color4,
    VertexData,
    ParticleSystem,
    Texture,
    GPUParticleSystem,
    KeyboardEventTypes
} from '@babylonjs/core';
import {getJSON} from '../node_modules/simple-get-json/dist/index-es.js';
import * as d3 from 'd3';
import * as d3Geo from 'd3-geo-projection';
import * as earcut from 'earcut'
import {LoadingScreen} from './LoadingScreen';
import {Utilities} from './Utilities';
import {CustomCamera, GeometryCollection, MeshgroupData} from './Types';

class App {
    private readonly covidDataUrl: string;
    private readonly countiesDataUrl: string;
    private readonly radius: number;
    private readonly scene: Scene;
    private readonly camera: CustomCamera;
    private counties: GeometryCollection;
    private covidCases: any;
    private drawnCounties: object;
    private utilities: Utilities;
    private engine: Engine;
    private totalCasesCount = 0;

    private readonly MAX_RANDOM_POINT_ITERATIONS = 500;
    private readonly CASE_DRAW_ITERATION_MIN_TIME = 200;
    private readonly NUMBER_OF_RANDOM_POINTS = 15;
    private readonly PARTICLE_SYSTEM_CAPACITY = 100;

    constructor() {
        this.covidDataUrl = 'https://opendata.arcgis.com/datasets/9644cad183f042e79fb6ad00eadc4ecf_0.geojson';
        this.countiesDataUrl = 'https://markusschmitz.info/landkreise_deutschland.json';
        this.drawnCounties = {};
        this.utilities = new Utilities();

        let canvas = document.createElement("canvas");
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);

        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);

        document.getElementsByTagName('canvas')[0].style.display = 'none';
        document.getElementsByTagName('canvas')[0].style.opacity = '0';

        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        this.scene.clearColor = new Color4(0, 0, 0, 1);
        this.radius = 160;

        let light = new HemisphericLight(
            'light1',
            new Vector3(0, 1, 0),
            this.scene
        );
        light.intensity = 1;

        this.camera = new CustomCamera(
            'Camera',
            -Math.PI / 2,
            Math.PI / 2,
            this.radius,
            Vector3.Zero(),
            this.scene
        ); // -pi/2, pi/2 gives you camera that looks into Z with Y up and X right
        this.camera.speed = 30000;
        this.camera.panningSensibility = 30;
        this.camera.inertia = 0;
        this.camera.minZ = 0;
        this.camera.attachControl(canvas, false);

        this.engine.loadingScreen = new LoadingScreen('preparing data');

        this.utilities.startProcess('Start: loading counties');

       // this.start();
        this.loadCountiesAndStartDrawing();

        // hide/show the Inspector
        window.addEventListener('keydown', (_event) => {
            // Ctrl+Alt+I
            if (_event.ctrlKey && _event.altKey && _event.keyCode === 73) {
                if (this.scene.debugLayer.isVisible()) {
                    this.scene.debugLayer.hide();
                } else {
                    this.scene.debugLayer.show();
                }
            }
        });

        // run the main render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });
    }

    showMessage1() {
        this.utilities.fadeIn(document.getElementById('message1'), () => {
            setTimeout(() => {
                this.utilities.fadeOut(document.getElementById('message1'), () => {
                    this.showMessage2();
                });
            }, 2000);
        });
    }

    showMessage2() {
        this.utilities.fadeIn(document.getElementById('message2'), () => {
             setTimeout(() => {
                 this.utilities.fadeOut(document.getElementById('message2'), () => {
                     this.showMessage3();
                 });
             }, 2000);
        });
    }

    showMessage3() {
        document.body.onkeyup = function (e) {
            if (e.keyCode == 32) {
                document.getElementById('message3').classList.remove('animate-flicker');
                let op = 1,
                    element = document.getElementById('message3');
                let timer = setInterval(function () {
                    if (op <= 0.05) {
                        clearInterval(timer);
                        element.style.display = 'none';
                        (window as any).app.loadCountiesAndStartDrawing();
                    }
                    element.style.opacity = '' + op;
                    element.style.filter = 'alpha(opacity=' + op * 100 + ")";
                    op -= op * 0.025;
                }, 10);
            }
        }

        this.utilities.fadeIn(document.getElementById('message3'), () => {
             setTimeout(() => {
                 document.getElementById('message3').classList.add('animate-flicker');
             }, 1000);
        });
    }

    start() {
        setTimeout(() => {
            this.showMessage1();
        }, 750);
    }

    loadCountiesAndStartDrawing() {
        this.engine.displayLoadingUI();
        getJSON([this.countiesDataUrl]).then((records) => {
            if (!records) {
                throw new Error('no county records');
            } else if (!records.length || !records[0].features) {
                throw new Error('wrong data structure for counties');
            }

            this.counties = records.pop();

            this.utilities.stopProcess('End: loading counties');

            this.drawCounties();
        }, (error) => {
            console.error('error', error);
        });
    }

    cameraTarget: Vector3;

    cameraTracking() {
        setTimeout(() => {
            this.camera.spinTo('beta', 2.62, 20);
        }, 0);
        setTimeout(async () => {
            this.cameraTarget = this.camera.getTarget().clone();
            this.cameraTarget.y = this.cameraTarget.y - 15;
            let timer = setInterval(() => {
                if (this.camera.getTarget().y < (this.cameraTarget.y + 1)) {
                    clearInterval(timer);
                }
                this.camera.setTarget(Vector3.Lerp(this.camera.getTarget(), this.cameraTarget, 0.01));
            }, 10);
        }, 0);
        setTimeout(() => {
            this.camera.spinTo('radius', 135, 20);
        }, 5000);
    }

    cameraMovement() {
        if (!this.camera) {
            return;
        }

        this.camera.setTarget(Vector3.Lerp(this.camera.getTarget(), this.cameraTarget, 0.001));
    }

    loadAndProcessCovidCases() {
        this.utilities.startProcess('Start: loading cases');
        getJSON([this.covidDataUrl]).then((records: GeometryCollection) => {
            if (!records) {
                throw new Error('failed to load covid records');
            } else if (!records.length || !records[0].features) {
                throw new Error('wrong data structure for covid records');
            }

            let data = records[0];

            data = data.features.sort(this.utilities.sortCasesByDate);

            if (!data) {
                throw new Error('missing covid case features');
            }

            this.totalCasesCount = 0;
            this.covidCases = this.utilities.groupCasesByDate(data);
            this.utilities.stopProcess('End: loading cases');

            this.engine.hideLoadingUI();

            let currentDayDomElement = document.getElementById('currentDay');
            if (!currentDayDomElement) {
                currentDayDomElement = document.createElement('div');
                currentDayDomElement.setAttribute('id', 'currentDay');
                currentDayDomElement.style.display = 'none';
                currentDayDomElement.style.opacity = '0';
                document.body.appendChild(currentDayDomElement);
                currentDayDomElement.innerHTML = '01.01.2020<br><span class="small">0 cumulative cases</span>';
                this.utilities.fadeIn(document.getElementsByTagName('canvas')[0], () => {
                    setTimeout(() => {
                        this.cameraTracking();
                    }, 4000);
                    setTimeout(() => {
                        this.drawCovidCases();
                    }, 8000);
                });
                setTimeout(() => {
                    this.utilities.fadeIn(currentDayDomElement, () => {
                    });
                }, 2000);
            }
        }, (error) => {
            console.error('error', error);
        });
    }

    getCountyKey(_raw) {
        let countyKey = parseInt(_raw, 10);
        // merge districts of Berlin to Landkreis Berlin
        switch (countyKey) {
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

    drawCovidCasesForDay(_covidCases, _date) {
        for (let i = 0; i < _covidCases.length; i++) {
            this.drawCovidCase(_covidCases[i], _date);
        }
        return true;
    }

    drawCovidCase(_covidCase, _date) {
        if (!_covidCase || !_covidCase.properties || !_covidCase.properties.IdLandkreis) {
            console.error(_covidCase);
            throw new Error('Wrong structure for covid case');
        }

        let countyKey = this.getCountyKey(_covidCase.properties.IdLandkreis),
            cases = parseInt(_covidCase.properties.AnzahlFall, 10);

        if (!this.drawnCounties.hasOwnProperty(countyKey)) {
            console.error('no drawn county for key: ' + countyKey);
            return;
        }

        let county = this.drawnCounties[countyKey],
            particleSystem = county.particleSystem,
            randomPoints = county.randomPoints;

        if (isNaN(cases) || cases < 1) {
            return;
        }

        this.totalCasesCount += cases;
        particleSystem.emitter = randomPoints[Math.floor((Math.random() * randomPoints.length))];
        if (_date > '2020/03/06') {
            particleSystem.minSize = 0.15;
            particleSystem.maxSize = 0.3;
        } else if(_date > '2020/03/01')  {
            particleSystem.minSize = 0.3;
            particleSystem.maxSize = 0.5;
        } else {
            particleSystem.minSize = 0.5;
            particleSystem.maxSize = 0.6;
        }
        particleSystem.manualEmitCount = cases;
    }

    async drawCovidCases() {
        this.utilities.startProcess('Start: drawing cases');

        let currentDayDomElement = document.getElementById('currentDay'),
            covidCases = this.covidCases,
            timeMax = this.CASE_DRAW_ITERATION_MIN_TIME,
            timestamp, executionTime, date, totalCasesFormatted;

        for (date in covidCases) {
            timestamp = performance.now();
            totalCasesFormatted = this.totalCasesCount.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1.");
            currentDayDomElement.innerHTML = this.utilities.formatDate(date) + '<br><span class="small">' + totalCasesFormatted + ' cumulative cases</span>';
            this.drawCovidCasesForDay(covidCases[date], date);
            executionTime = performance.now() - timestamp;

            // slow down the process to show each day long enough
            if (executionTime < timeMax) {
                await this.utilities.sleep(timeMax - executionTime);
            }
        }
        console.info('Max execution time for particle drawing: ' + timeMax);
        this.utilities.stopProcess('End: drawing cases');
        currentDayDomElement.innerHTML = this.utilities.formatDate(date) + '<br><span class="small">1.891.581 cumulative cases</span>';
        this.showOutro();
    }

    showOutro() {
        setTimeout(() => {
            this.utilities.fadeOut(document.getElementById('currentDay'), () => {
            });
            this.utilities.fadeOut(document.getElementsByTagName('canvas')[0], () => {
            });
        }, 5000);
    }

    prepareCountyData(_counties) {
        this.utilities.startProcess('Start: projecting GeoJSON');

        // project the lat and long values from GeoJSON to pixel values
        let counties = d3Geo.geoProject(_counties, this.utilities.getProjection(d3.geoBounds(_counties)));

        // projected values are in the wrong orientation for displaying on canvas so we flip them
        counties = d3Geo.geoProject(counties, d3.geoIdentity().reflectY(true));

        this.utilities.stopProcess('End: projecting GeoJSON');

        return counties;
    }

    drawCounties() {
        if (!this.counties) {
            throw new Error('Missing counties');
        }

        let counties = this.prepareCountyData(this.counties);
        counties = counties.features;

        this.utilities.startProcess('Start: generating meshes');
        let meshGroup = [],
            feature, geometry, properties, countyLabel, countyAgs, flattenedGeometry;

        for (let i = 0; i < counties.length; i++) {
            feature = counties[i];
            geometry = feature.geometry;
            properties = feature.properties;

            if (!geometry || !properties || !properties.GEN || !properties.AGS) {
                console.error(feature);
                throw new Error('Missing properties on feature');
            }

            countyLabel = properties.GEN;
            countyAgs = parseInt(properties.AGS, 10); // places 1-2 state, places 3-5 for county

            if (feature.geometry.type === 'MultiPolygon') {
                flattenedGeometry = geometry.coordinates.map((coord, i) => {
                    return {
                        ...earcut.flatten(coord),
                        countyAgs: countyAgs,
                        id: `${countyAgs}-${i}`,
                        countyLabel: countyLabel
                    };
                });
            } else {
                flattenedGeometry = {
                    ...earcut.flatten(geometry.coordinates),
                    countyAgs: countyAgs,
                    countyLabel: countyLabel,
                    id: `${countyAgs}-0`
                };
            }

            if (!flattenedGeometry) {
                throw new Error('Missing flattened geometry');
            }

            let extractionResult = [];

            // some geometries are MultiPolygons, some just Polygons
            if (Array.isArray(flattenedGeometry)) {
                flattenedGeometry.forEach((_geometry) => {
                    let tempExtractedData = this.extractPositionsAndIndexes(_geometry);

                    if (!tempExtractedData.indices || !tempExtractedData.indices.length) {
                        console.log('Failed to extract data')
                        return;
                    }

                    extractionResult.push(tempExtractedData);
                });
            } else {
                extractionResult.push(this.extractPositionsAndIndexes(flattenedGeometry));
            }

            let countyMeshgroup = [];

            countyAgs = null;
            countyLabel = '';

            // iterate over all vertices of the current county and generate meshes
            extractionResult.forEach((extractedData) => {
                countyAgs = null;
                let mesh = this.getCountyMesh(extractedData);
                if (mesh) {
                    // countyAgs is the same for all elements of a MultiPolygon
                    countyAgs = extractedData.countyAgs;
                    countyLabel = extractedData.countyLabel;
                    meshGroup.push(mesh);
                    countyMeshgroup.push(mesh);
                } else {
                    throw new Error('Failed to generate county mesh');
                }
            });

            if (countyAgs) {
                let meshgroupData = this.getMeshgroupBoundingBox(countyMeshgroup),
                    boundingBox = meshgroupData.boundingBox,
                    randomPoints = meshgroupData.randomPoints,
                    center = boundingBox.centerWorld;

                this.drawnCounties[countyAgs] = {
                    county: countyLabel,
                    center: center,
                    randomPoints: randomPoints,
                    properties: properties,
                    particleSystem: this.drawParticleSystem(center.x, center.y)
                }
            } else {
                console.error('Missing AGS', countyLabel);
            }
        }

        console.info('drawing ' + counties.length + ' counties as ' + meshGroup.length + ' meshes');

        let meshgroupData = this.getMeshgroupBoundingBox(meshGroup),
            boundingBox = meshgroupData.boundingBox;

        this.utilities.stopProcess('End: generating meshes');

        let minX = boundingBox.minimumWorld.x;
        let minY = boundingBox.minimumWorld.y;
        let maxX = boundingBox.maximumWorld.x;
        let maxY = boundingBox.maximumWorld.y;
        let {centerWorld} = boundingBox;
        let height = (maxY - minY);
        let fov = this.camera.fov;
        let aspectRatio = this.engine.getAspectRatio(this.camera);
        let distance = (height / 1.75 / aspectRatio) / Math.tan(fov / 2);
        this.camera.setTarget(centerWorld);
        this.camera.setPosition(new Vector3(centerWorld.x, centerWorld.y, centerWorld.z - distance));
        this.loadAndProcessCovidCases();
    }

    getMeshgroupBoundingBox(_meshgroup: Mesh[]) {
        let meshGroupClone = [];

        for (let i = 0; i < _meshgroup.length; i++) {
            meshGroupClone.push(_meshgroup[i].clone("clone"));
        }

        // merge all meshes to one group and get the bounding box
        let mergedMesh = Mesh.MergeMeshes(meshGroupClone, true, true),
            randomPoints = [],
            randomPoint,
            iterations;

        for (let k = meshGroupClone.length; k > 0; k--) {
            meshGroupClone[k - 1].dispose();
        }

        mergedMesh.isVisible = false;

        let {boundingBox} = mergedMesh.getBoundingInfo(),
            data: MeshgroupData = {
                boundingBox: {},
                randomPoints: {}
            };

        for (let i = 0; i < this.NUMBER_OF_RANDOM_POINTS; i++) {
            iterations = 0;
            do {
                let maxX = boundingBox.maximum.x,
                    minX = boundingBox.minimum.x,
                    maxY = boundingBox.maximum.y,
                    minY = boundingBox.minimum.y,
                    x = (Math.random() * (maxX - minX) + minX),
                    y = (Math.random() * (maxY - minY) + minY);

                randomPoint = new Vector3(x, y, boundingBox.center.z);
                ++iterations;

                if (iterations > this.MAX_RANDOM_POINT_ITERATIONS) {
                    console.error("check deadlock");
                    break;
                }
            }
            while (!mergedMesh.intersectsPoint(randomPoint));
            randomPoints.push(randomPoint);
        }

        mergedMesh.dispose();

        data.boundingBox = boundingBox;
        data.randomPoints = randomPoints;

        return data;
    }


    drawParticleSystem(_positionX, _positionY) {
        let particleSystemInstance = new ParticleSystem("particles", this.PARTICLE_SYSTEM_CAPACITY, this.scene);
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
        particleSystemInstance.minEmitPower = 0.5;
        particleSystemInstance.maxEmitPower = 1;
        particleSystemInstance.minLifeTime = 0.5;
        particleSystemInstance.maxLifeTime = 2;
        particleSystemInstance.direction1 = new Vector3(0, 0, -10);
        particleSystemInstance.manualEmitCount = 0;
        particleSystemInstance.start();
        // particleSystemInstance.disposeOnStop = true;

        return particleSystemInstance;
    }

    extractPositionsAndIndexes(_geometry) {
        if (!_geometry || !_geometry.vertices) {
            throw new Error('Missing verticies');
        }

        let coordinates = [].slice.apply(_geometry.vertices);

        if (
            coordinates[0] === coordinates[coordinates.length - 2] &&
            coordinates[1] === coordinates[coordinates.length - 1]
        ) {
            coordinates.pop();
            coordinates.pop();
        }

        let indices = earcut(coordinates, _geometry.holes, _geometry.dimensions);

        // add z-coordinate for all points
        let zCoordinate = 0;

        // coordinates array has the form [x1,y1,x2,y2,x3,y3...]
        for (let i = 2; i < coordinates.length; i += 3) {
            coordinates.splice(i, 0, zCoordinate);
        }
        coordinates.splice(coordinates.length, 0, zCoordinate);

        return {
            positions: coordinates,
            indices,
            countyLabel: _geometry.countyLabel,
            countyAgs: _geometry.countyAgs
        };
    }

    getCountyMesh(_corners) {
        if (!_corners || !_corners.positions || !_corners.indices) {
            console.error(_corners);
            throw new Error('wrong corner data');
        }

        let customMesh = new Mesh('poly', this.scene),
            vertexData = new VertexData(),
            material = new StandardMaterial(`caseMaterial`, this.scene),
            randomColor = Color3.Black();

        material.diffuseColor = randomColor;
        material.emissiveColor = randomColor;

        vertexData.positions = _corners.positions;
        vertexData.indices = _corners.indices;

        vertexData.applyToMesh(customMesh, true);

        randomColor = Color3.White();
        customMesh.enableEdgesRendering();
        customMesh.edgesWidth = 20.0;
        customMesh.edgesColor = new Color4(randomColor.r, randomColor.g, randomColor.b, 0.75);

        customMesh.material = material;

        return customMesh;
    }
}

window.onload = function () {
    (window as any).app = new App();
};
