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
import {anaglyphPixelShader} from '@babylonjs/core/Shaders/anaglyph.fragment';

class App {
    private readonly covidDataUrl: string;
    private readonly countiesDataUrl: string;
    private readonly radius: number;
    private readonly scene: Scene;
    private readonly camera: CustomCamera;
    private counties: GeometryCollection;
    private covidCases: any;
    private drawnCounties: any;
    private utilities: Utilities;
    private engine: Engine;
    private totalCasesCount = 0;
    private meshesOfAllCounties: any;
    private numberOfLoadedCounties: any;
    private elapsedTimeForCountyPreparation: any;

    private readonly MAX_RANDOM_POINT_ITERATIONS = 500;
    private readonly CASE_DRAW_ITERATION_MIN_TIME = 200;
    private readonly NUMBER_OF_RANDOM_POINTS = 15;
    private readonly PARTICLE_SYSTEM_CAPACITY = 100;

    constructor() {
        if (!window || !window.innerWidth || !window.innerHeight || !document) {
            alert('oh oh, something\'s wrong here :-/\nYou could let me know that this happened, so I can fix the issue: \nhello@markusschmitz.info');
            throw new Error('global properties are undefined');
        }

        this.checkMinimumWindowSize();

        console.info('%ccode and concept by Markus Schmitz. Check ' +
            'https://github.com/markusschmitz53/sars2020 for details about the project.', 'padding: 1rem; background: #000; color: #FFF');

        this.covidDataUrl = 'https://opendata.arcgis.com/datasets/9644cad183f042e79fb6ad00eadc4ecf_0.geojson';
        this.countiesDataUrl = 'https://markusschmitz.info/landkreise_deutschland.json';
        this.drawnCounties = {};
        this.elapsedTimeForCountyPreparation = 0;
        this.utilities = new Utilities();

        let canvas = document.createElement("canvas");
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);

        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);

        document.getElementsByTagName('canvas')[0].style.display = 'none';
        document.getElementsByTagName('canvas')[0].style.opacity = '0';

        window.addEventListener('resize', () => {
            this.checkMinimumWindowSize();
            if (this.engine) {
                this.engine.resize();
            }
        });

        this.scene.clearColor = new Color4(0, 0, 0, 1);
        this.radius = 160;

        let light = new HemisphericLight(
            'light1',
            new Vector3(0, 1, -0.08),
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

        this.start();

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
        setTimeout(() => {
            this.utilities.fadeIn(document.getElementById('message1'), () => {
                setTimeout(() => {
                    this.utilities.fadeOut(document.getElementById('message1'), () => {
                        this.showMessage2();
                    });
                }, 4000);
            });
        }, 500);
    }

    showMessage2() {
        this.utilities.fadeIn(document.getElementById('message2'), () => {
             setTimeout(() => {
                 this.utilities.fadeOut(document.getElementById('message2'), () => {
                     setTimeout(() => {
                         (window as any).app.drawCountyMeshes();
                     }, 1000);
                 });
             }, 4000);
        });
    }

    checkMinimumWindowSize() {
        if (window.innerWidth < 1100 || window.innerHeight < 700) {
            alert('I\'m sorry but your screen needs at least 700 pixel high and 1100 pixel wide to display the animation on this page.');
            throw new Error('screen is too small');
        }
    }

    start() {
        this.showMessage1();
        this.loadCounties();
        this.loadAndProcessCovidCases();
    }

    loadCounties() {
        //this.engine.displayLoadingUI();

        let performanceValueT0 = this.utilities.startProcess('Start: loading counties');

        getJSON([this.countiesDataUrl]).then((records) => {
            if (!records) {
                throw new Error('no county records');
            } else if (!records.length || !records[0].features) {
                throw new Error('wrong data structure for counties');
            }

            this.counties = records.pop();
            this.utilities.stopProcess(performanceValueT0, 'End: loading counties');

            this.prepareCountyMeshes();
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
        let performanceValueT0 = this.utilities.startProcess('Start: loading cases');
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

            this.covidCases = this.utilities.fixCasesAndGroupByDate(data);
            this.utilities.stopProcess(performanceValueT0, 'End: loading cases');
        }, (error) => {
            console.error('error', error);
        });
    }

    startDrawingCases(_withoutCameraTracking?) {
        this.totalCasesCount = 0;
        let currentDayDomElement = document.getElementById('currentDay');
        if (!currentDayDomElement) {
            currentDayDomElement = document.createElement('div');
            currentDayDomElement.setAttribute('id', 'currentDay');
            currentDayDomElement.style.display = 'none';
            currentDayDomElement.style.opacity = '0';
            document.body.appendChild(currentDayDomElement);
        }

        currentDayDomElement.innerHTML = '01.01.2020<br><span class="small">0 cumulative cases</span>';
        if (!_withoutCameraTracking) {
            this.utilities.fadeIn(document.getElementsByTagName('canvas')[0], () => {
                setTimeout(() => {
                    this.cameraTracking();
                }, 4000);
                setTimeout(() => {
                    this.drawCovidCases();
                }, 8000);
            });
        } else {
            this.utilities.fadeIn(document.getElementsByTagName('canvas')[0], () => {
                setTimeout(() => {
                    this.drawCovidCases();
                }, 2000);
            });
        }
        setTimeout(() => {
            this.utilities.fadeIn(currentDayDomElement, () => {
            });
        }, 2000);
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
            particleSystem.maxSize = 0.4;
        } else {
            particleSystem.minSize = 0.5;
            particleSystem.maxSize = 0.6;
        }
        particleSystem.manualEmitCount = cases;
    }

    async drawCovidCases() {
        let performanceValueT0 = this.utilities.startProcess('Start: drawing cases');

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
        this.utilities.stopProcess(performanceValueT0, 'End: drawing cases');
        currentDayDomElement.innerHTML = this.utilities.formatDate(date) + '<br><span class="small">1.891.581 cumulative cases</span>';
       // this.showOutro();
    }

    showOutro() {
        setTimeout(() => {
            this.utilities.fadeOut(document.getElementById('currentDay'), () => {
            });
            this.utilities.fadeOut(document.getElementsByTagName('canvas')[0], () => {
                setTimeout(() => {
                    let messageElement = document.getElementById('message4');
                    this.utilities.fadeIn(messageElement, () => {
                        messageElement.classList.add('animate-flicker');
                        document.body.onkeyup = function (e) {
                            if (e.keyCode == 32) {
                                messageElement.classList.add('stop-animation');
                                setTimeout(() => {
                                    messageElement.classList.remove('animate-flicker');
                                    (window as any).app.utilities.fadeOut(messageElement, () => {
                                        messageElement.classList.remove('stop-animation');
                                    });
                                }, 200);
                                setTimeout(() => {
                                    (window as any).app.startDrawingCases(true);
                                }, 1500);
                                document.body.onkeyup = null;
                            }
                        }
                    });
                }, 1000);
            });
        }, 4000);
    }

    prepareCountyData(_counties) {
        let performanceValueT0 = this.utilities.startProcess('Start: projecting GeoJSON');

        // project the lat and long values from GeoJSON to pixel values
        let counties = d3Geo.geoProject(_counties, this.utilities.getProjection(d3.geoBounds(_counties)));

        // projected values are in the wrong orientation for displaying on canvas so we flip them
        counties = d3Geo.geoProject(counties, d3.geoIdentity().reflectY(true));

        this.utilities.stopProcess(performanceValueT0, 'End: projecting GeoJSON');

        return counties.features;
    }

    prepareCountyMeshes() {
        if (!this.counties) {
            throw new Error('Missing counties');
        }

        let performanceValueT0 = this.utilities.startProcess('Start: generating meshes');

        let countiesProjectedGeoJsonData = this.prepareCountyData(this.counties),
        positionsAndIndicesForCounty, countyMeshes, feature, geometry, properties, countyLabel, countyAgs, flattenedGeometry;

        this.meshesOfAllCounties = [];
        this.numberOfLoadedCounties = countiesProjectedGeoJsonData.length;

        for (let i = 0; i < countiesProjectedGeoJsonData.length; i++) {
            feature = countiesProjectedGeoJsonData[i];
            geometry = feature.geometry;
            properties = feature.properties;
            positionsAndIndicesForCounty = [];
            countyMeshes = [];

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

            // some geometries are MultiPolygons, some just Polygons
            if (Array.isArray(flattenedGeometry)) {
                flattenedGeometry.forEach((_geometry) => {
                    let tempExtractedData = this.extractPositionsAndIndices(_geometry);

                    if (!tempExtractedData.indices || !tempExtractedData.indices.length) {
                        console.error('Failed to extract data')
                        return;
                    }

                    positionsAndIndicesForCounty.push(tempExtractedData);
                });
            } else {
                positionsAndIndicesForCounty.push(this.extractPositionsAndIndices(flattenedGeometry));
            }

            countyAgs = null;
            countyLabel = '';

            // iterate over all vertices of the current county and generate meshes
            positionsAndIndicesForCounty.forEach((extractedData) => {
                countyAgs = null;
                let mesh = this.getCountyMesh(extractedData);
                if (mesh) {
                    // countyAgs is the same for all elements of a MultiPolygon
                    countyAgs = extractedData.countyAgs;
                    countyLabel = extractedData.countyLabel;
                    countyMeshes.push(mesh);
                    this.meshesOfAllCounties.push(mesh);
                } else {
                    throw new Error('Failed to generate county mesh');
                }
            });

            if (countyAgs) {
                let meshgroupData = this.getMeshgroupBoundingBox(countyMeshes),
                    boundingBox = meshgroupData.boundingBox,
                    randomPoints = meshgroupData.randomPoints,
                    center = boundingBox.centerWorld;

                this.drawnCounties[countyAgs] = {
                    county: countyLabel,
                    center: center,
                    randomPoints: randomPoints,
                    properties: properties,
                    countyMeshes: countyMeshes,
                    particleSystem: this.drawParticleSystem(center.x, center.y)
                }
            } else {
                console.error('Missing AGS', countyLabel);
            }
        }

        this.elapsedTimeForCountyPreparation = this.utilities.stopProcess(performanceValueT0, 'End: generating meshes');
    }

    drawCountyMeshes() {
        if (true || this.elapsedTimeForCountyPreparation === 0 || this.elapsedTimeForCountyPreparation > '6.0') {
            alert('I hate to break it to you but while you were sitting there all excited I was doing some calculations and ... it\'s not looking good.' +
                '\nIt could be that your hardware is too slow or I\'m bad a math, we\'ll never know. Let\'s just call it unfortunate circumstances for now.' +
                '\n\nAs a matter of fact, it took over ' + this.elapsedTimeForCountyPreparation + ' seconds to generate some data in the background and that\'s just too long.' +
                '\n\nIf your computer is running on battery try plugging it into a power source or ask your neighbor to use their computer 8-)')
            throw new Error('data preparation took too long (' + this.elapsedTimeForCountyPreparation + 's)');
        }

        let performanceValueT0 = this.utilities.startProcess('Start: drawing meshes');

        console.info('drawing ' + this.numberOfLoadedCounties + ' counties as ' + this.meshesOfAllCounties.length + ' meshes');
        let meshgroupData = this.getMeshgroupBoundingBox(this.meshesOfAllCounties),
            boundingBox = meshgroupData.boundingBox,
            countyAgs, countyMeshes;

        for (countyAgs in this.drawnCounties) {
            if (!this.drawnCounties.hasOwnProperty(countyAgs)) {
                continue;
            }
            countyMeshes = this.drawnCounties[countyAgs].countyMeshes;
            for (let i = 0; i < countyMeshes.length; i++) {
                countyMeshes[i].setEnabled(true);
            }
        }

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

        this.utilities.stopProcess(performanceValueT0, 'End: drawing meshes');

        this.startDrawingCases();
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

    extractPositionsAndIndices(_geometry) {
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

        customMesh.setEnabled(false);

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
