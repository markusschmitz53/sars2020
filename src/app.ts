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
    KeyboardEventTypes,
    PointerEventTypes
} from '@babylonjs/core';
import {getJSON} from '../node_modules/simple-get-json/dist/index-es.js';
import * as d3 from 'd3';
import * as d3Geo from 'd3-geo-projection';
import * as earcut from 'earcut'
import {Utilities} from './Utilities';
import {CustomCamera, GeometryCollection} from './Types';
import {Feature} from 'geojson';

class App {
    private readonly DEBUG_MODE = false;
    private readonly MAX_RANDOM_POINT_ITERATIONS = 500;
    private readonly CASE_DRAW_ITERATION_MIN_TIME = 300;
    private readonly NUMBER_OF_RANDOM_POINTS = 15;
    private readonly PARTICLE_SYSTEM_CAPACITY = 100;
    private readonly CAMERA_MOVEMENT_LIMIT = 50;
    private readonly CAMERA_MOVEMENT_SPEED = 0.4;
    private readonly COUNTY_POLLING_LIMIT = 10000;
    private readonly COUNTY_POLLING_INTERVAL = 50;
    private readonly COVID_DATA_URL = 'https://opendata.arcgis.com/datasets/9644cad183f042e79fb6ad00eadc4ecf_0.geojson';
    private readonly COUNTIES_DATA_URL = 'https://sars.markusschmitz.info/landkreise_deutschland.json';

    private readonly radius: number;
    private readonly scene: Scene;
    private readonly camera: CustomCamera;
    private readonly utilities: Utilities;
    private readonly engine: Engine;
    private readonly countyStandardMaterial: StandardMaterial;
    private readonly colorBlack: Color3;
    private readonly colorGray: Color3;
    private readonly countyEdgeColor: Color4;
    private readonly colorWhiteNonTransparent: Color4;
    private readonly colorWhiteTransparent: Color4;
    private readonly particleDirection: Vector3;
    private readonly particleTexture: Texture;
    private readonly increaseParticleSizeDate1: number;
    private readonly increaseParticleSizeDate2: number;

    private readonly drawnCounties: object;
    private readonly baseParticleSystemInstance: ParticleSystem;
    private counties: GeometryCollection;
    private covidCases: Array<Feature>;
    private centerWorld: any;
    private drawnCasesCount = 0;
    private meshesOfAllCounties: Array<Mesh>;
    private numberOfLoadedCounties: number;
    private elapsedTimeForCountyPreparation: string;

    constructor() {
        if (!window || !window.innerWidth || !window.innerHeight || !document) {
            alert('oh oh, something\'s wrong here :-/\nYou could let me know that this happened, so I can fix the issue: \nhello@markusschmitz.info');
            throw new Error('global properties are undefined');
        }

        console.info('%ccode and concept by Markus Schmitz. Check ' +
            'https://github.com/markusschmitz53/sars2020 for details about the project.', 'padding: 1rem; background: #000; color: #FFF');
        this.elapsedTimeForCountyPreparation = '0.0';
        this.utilities = new Utilities();
        this.drawnCounties = {};
        this.radius = 160;

        this.colorBlack = Color3.Black();
        this.colorGray = Color3.Gray();
        this.countyEdgeColor = new Color4(this.colorGray.r, this.colorGray.g, this.colorGray.b, 0.5);
        this.colorWhiteNonTransparent = new Color4(1, 1, 1, 1);
        this.colorWhiteTransparent = new Color4(1, 1, 1, 0);

        this.particleDirection = new Vector3(0, 0, -10);
        this.increaseParticleSizeDate1 = Date.parse('2020-02-25');
        this.increaseParticleSizeDate2 = Date.parse('2020-03-01');

        let canvas = document.createElement("canvas");
        canvas.id = 'gameCanvas';
        document.body.appendChild(canvas);

        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0, 0, 0, 1);
        this.scene.autoClear = false; // Color buffer
        this.scene.autoClearDepthAndStencil = false; // Depth and stencil, obviously

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
        let light = new HemisphericLight(
            'light1',
            new Vector3(0, 1, -0.08),
            this.scene
        );
        light.intensity = 1;

        this.countyStandardMaterial = new StandardMaterial('caseMaterial', this.scene);
        this.particleTexture = new Texture('https://sars.markusschmitz.info/red_flare.png', this.scene);

        this.baseParticleSystemInstance = new ParticleSystem('particles', this.PARTICLE_SYSTEM_CAPACITY, this.scene)

        canvas.style.display = 'none';
        canvas.style.opacity = '0';

        let divFps = document.getElementById('fps');
        if (this.DEBUG_MODE) {
            divFps.style.display = 'block';
        }

        this.addWindowListeners();
        this.startAnimation();

        // run the main render loop
        this.engine.runRenderLoop(() => {
            //divFps.innerHTML = this.engine.getFps().toFixed() + ' fps';
            this.scene.render();
        });
    }

    startAnimation() {
        this.loadCounties();
        this.showMessage1();
        this.loadAndProcessCovidCases();
    }

    showMessage1() {
        setTimeout(() => {
            this.utilities.fadeIn(document.getElementById('message1'), () => {
                let pollCounter = 0,
                    intervalId = setInterval(() => {
                        ++pollCounter;

                        // wait for counties to be loaded
                        if (this.counties) {
                            clearInterval(intervalId);
                            this.prepareCountyMeshes();
                        }
                        if (pollCounter > this.COUNTY_POLLING_LIMIT) {
                            alert('sorry but something seems to be wrong. you can try again later.');
                            throw new Error('county load timed out');
                        }
                    }, this.COUNTY_POLLING_INTERVAL);

                setTimeout(() => {
                    this.utilities.fadeOut(document.getElementById('message1'), () => {
                        this.showMessage2();
                    });
                }, 4000);
            });
        }, 200);
    }

    showMessage2() {
        this.utilities.fadeIn(document.getElementById('message2'), () => {
             setTimeout(() => {
                 this.utilities.fadeOut(document.getElementById('message2'), () => {
                     setTimeout(() => {
                         (window as any).app.setCameraAddControlsAndStart();
                     }, 1000);
                 });
             }, 4000);
        });
    }

    loadCounties() {
        let performanceValueT0;

        if (this.DEBUG_MODE) {
            performanceValueT0 = this.utilities.startProcess('Start: loading counties');
        }

        getJSON([this.COUNTIES_DATA_URL]).then((records) => {
            if (!records) {
                throw new Error('no county records');
            } else if (!records.length || !records[0].features) {
                throw new Error('wrong data structure for counties');
            }

            this.counties = records.pop();

            if (this.DEBUG_MODE) {
                this.utilities.stopProcess(performanceValueT0, 'End: loading counties');
            }
        }, (error) => {
            console.error('error', error);
        });
    }

    cameraTarget: Vector3;

    cameraTracking() {
        setTimeout(() => {
            this.camera.spinTo('beta', 2.2, 20);
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
            this.camera.spinTo('radius', 145, 20);
        }, 5000);
    }

    loadAndProcessCovidCases() {
        let performanceValueT0;

        if (this.DEBUG_MODE) {
            performanceValueT0 = this.utilities.startProcess('Start: loading cases');
        }

        getJSON([this.COVID_DATA_URL]).then((records: GeometryCollection) => {
            if (!records) {
                throw new Error('failed to load covid records');
            } else if (!records.length || !records[0].features) {
                throw new Error('wrong data structure for covid records');
            }

            let data = records.pop();

            data = data.features.sort(this.utilities.sortCasesByDate);

            if (!data) {
                throw new Error('missing covid case features');
            }

            this.covidCases = this.utilities.fixCasesAndGroupByDate(data);

            if (this.DEBUG_MODE) {
                this.utilities.stopProcess(performanceValueT0, 'End: loading cases');
            }
        }, (error) => {
            console.error('error', error);
        });
    }

    startDrawingCases(_withoutCameraTracking?) {
        this.drawnCasesCount = 0;
        let canvas = document.getElementsByTagName('canvas')[0],
            currentDayDomElement = document.getElementById('currentDay');

        if (!currentDayDomElement) {
            currentDayDomElement = document.createElement('div');
            currentDayDomElement.setAttribute('id', 'currentDay');
            currentDayDomElement.setAttribute('title', 'Cumulative number of reported cases in Germany until the date');
            currentDayDomElement.style.display = 'none';
            currentDayDomElement.style.opacity = '0';
            document.body.appendChild(currentDayDomElement);
        }

        currentDayDomElement.innerHTML = '01.01.2020<br><span class="small">0 cumulative cases</span>';
        if (!_withoutCameraTracking) {
            this.utilities.fadeIn(canvas, () => {
                setTimeout(() => {
                    this.cameraTracking();
                }, 4000);
                setTimeout(() => {
                    this.drawCovidCases();
                }, 10000);
            });
        } else {
            this.utilities.fadeIn(canvas, () => {
                setTimeout(() => {
                    this.drawCovidCases();
                }, 2000);
            });
        }
        setTimeout(() => {
            this.utilities.fadeIn(currentDayDomElement, () => {});
        }, 2000);
    }

    drawCovidCasesForDay(_covidCases, _date) {
        let parsedDate = Date.parse(_date),
        particleSize;

        if (parsedDate > this.increaseParticleSizeDate2) {
            particleSize = 1;
        } else if(parsedDate > this.increaseParticleSizeDate1)  {
            particleSize = 2;
        } else {
            particleSize = 3;
        }

        for (let i = 0; i < _covidCases.length; i++) {
            this.drawCovidCase(_covidCases[i], _date, particleSize);
        }
        return true;
    }

    drawCovidCase(_covidCase, _date, _particleSize) {
        if (!_covidCase || !_covidCase.properties || !_covidCase.properties.IdLandkreis) {
            console.error(_covidCase);
            throw new Error('Wrong structure for covid case');
        }

        let countyKey = _covidCase.properties.IdLandkreis,
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

        this.drawnCasesCount += cases;
        particleSystem.emitter = randomPoints[Math.floor((Math.random() * randomPoints.length))];

        switch (_particleSize) {
            case 3:
                particleSystem.minSize = 0.5;
                particleSystem.maxSize = 0.6;
                break;
            case 2:
                particleSystem.minSize = 0.3;
                particleSystem.maxSize = 0.4;
                break;
            default:
                particleSystem.minSize = 0.15;
                particleSystem.maxSize = 0.3;
        }
        particleSystem.manualEmitCount = cases;
    }

    async drawCovidCases() {
        let performanceValueT0;
        if (this.DEBUG_MODE) {
            performanceValueT0 = this.utilities.startProcess('Start: drawing cases');
        }

        let currentDayDomElement = document.getElementById('currentDay'),
            covidCases = this.covidCases,
            timeMin = this.CASE_DRAW_ITERATION_MIN_TIME,
            timeMax = 0,
            timestamp, executionTime, date, totalCasesFormatted;

        for (date in covidCases) {
            timestamp = performance.now();

            // at thousands separators to the number of cumulative cases
            totalCasesFormatted = this.drawnCasesCount.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1.");
            currentDayDomElement.innerHTML = this.utilities.formatDateToGerman(date) + '<br><span class="small">' + totalCasesFormatted + ' cumulative cases</span>';
            this.drawCovidCasesForDay(covidCases[date], date);
            executionTime = performance.now() - timestamp;

            if (executionTime > timeMax) {
                timeMax = executionTime;
            }

            // slow down the process to show each day long enough
            if (executionTime < timeMin) {
                await this.utilities.sleep(timeMin - executionTime);
            }
        }

        if (this.DEBUG_MODE) {
            console.info('Max execution time for particle drawing: ' + executionTime);
            this.utilities.stopProcess(performanceValueT0, 'End: drawing cases');
        }

        currentDayDomElement.innerHTML = this.utilities.formatDateToGerman(date) + '<br><span class="small">1.891.581 cumulative cases</span>';
        this.showOutro();
    }

    showOutro() {
        setTimeout(() => {
            this.utilities.fadeOut(document.getElementById('currentDay'), () => {
            });
            this.utilities.fadeOut(document.getElementsByTagName('canvas')[0], () => {
                setTimeout(() => {
                    let messageElement = document.getElementById('message3');
                    this.utilities.fadeIn(messageElement, () => {
                        messageElement.classList.add('animate-flicker');

                        // it get's even more ugly here listening for the persons click ...
                        document.body.onmousedown = function (e) {
                            messageElement.classList.add('stop-animation');
                            setTimeout(() => {
                                messageElement.classList.remove('animate-flicker');
                                (window as any).app.utilities.fadeOut(messageElement, () => {
                                    messageElement.classList.remove('stop-animation');
                                    (window as any).app.utilities.fadeOut(document.getElementById('message4'), () => {
                                    });
                                });
                            }, 200);
                            setTimeout(() => {
                                (window as any).app.startDrawingCases(true);
                            }, 1500);
                            document.body.onmousedown = null;
                        }
                    });
                    setTimeout(() => {
                        this.utilities.fadeIn(document.getElementById('message4'), () => {
                        });
                    }, 200);
                }, 1000);
            });
        }, 4000);
    }

    prepareCountyData(_counties) {
        let performanceValueT0;
        if (this.DEBUG_MODE) {
            performanceValueT0 = this.utilities.startProcess('Start: projecting GeoJSON');
        }

        // project the lat and long values from GeoJSON to pixel values
        let counties = d3Geo.geoProject(_counties, this.utilities.getProjection(d3.geoBounds(_counties)));

        // projected values are in the wrong orientation for displaying on canvas so we flip them
        counties = d3Geo.geoProject(counties, d3.geoIdentity().reflectY(true));


        if (this.DEBUG_MODE) {
            this.utilities.stopProcess(performanceValueT0, 'End: projecting GeoJSON');
        }

        return counties.features;
    }

    prepareCountyMeshes() {
        if (!this.counties) {
            throw new Error('Missing counties');
        }

        let performanceValueT0 = this.utilities.startProcess('Start: generating meshes');

        // get geo projected county data
        let countiesProjectedGeoJsonData = this.prepareCountyData(this.counties),
            countyMeshInstance = new Mesh('poly', this.scene),
            countyMaterial = this.countyStandardMaterial,
            countyMeshes, feature, geometry, properties, countyLabel, countyAgs, flattenedGeometry,
            tempExtractedData;

        countyMaterial.diffuseColor = this.colorBlack;
        countyMaterial.emissiveColor = this.colorBlack;

        this.meshesOfAllCounties = [];
        this.numberOfLoadedCounties = countiesProjectedGeoJsonData.length;

        // iterate over the features of the geometry (= counties)
        for (let i = 0; i < countiesProjectedGeoJsonData.length; i++) {
            feature = countiesProjectedGeoJsonData[i];
            geometry = feature.geometry;
            properties = feature.properties;
            countyMeshes = [];

            if (!geometry || !properties || !properties.GEN || !properties.AGS) {
                console.error(feature);
                throw new Error('Missing properties on feature');
            }

            countyLabel = properties.GEN;
            countyAgs = parseInt(properties.AGS, 10); // places 1-2 for state, places 3-5 for county

            if (feature.geometry.type === 'MultiPolygon') {
                flattenedGeometry = geometry.coordinates.map((coord, i) => {
                    return {
                        ...earcut.flatten(coord),
                        countyAgs: countyAgs,
                        countyLabel: countyLabel,
                        id: `${countyAgs}-${i}`
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

            countyAgs = null;
            countyLabel = '';

            // some geometries are MultiPolygons, some just Polygons
            if (Array.isArray(flattenedGeometry)) {
                flattenedGeometry.forEach((_geometry) => {
                    tempExtractedData = this.utilities.extractPositionsAndIndices(_geometry);

                    if (!tempExtractedData.indices || !tempExtractedData.indices.length) {
                        console.error('Failed to extract data')
                        return;
                    }

                    let mesh = this.getCountyMesh(tempExtractedData, countyMaterial, countyMeshInstance);
                    if (mesh) {
                        // countyAgs is the same for all elements of a MultiPolygon
                        countyAgs = tempExtractedData.countyAgs;
                        countyLabel = tempExtractedData.countyLabel;
                        countyMeshes.push(mesh);
                        this.meshesOfAllCounties.push(mesh);
                    } else {
                        throw new Error('Failed to generate county mesh');
                    }
                });
            } else {
                tempExtractedData = this.utilities.extractPositionsAndIndices(flattenedGeometry);
                let mesh = this.getCountyMesh(tempExtractedData, countyMaterial, countyMeshInstance);
                if (mesh) {
                    countyAgs = tempExtractedData.countyAgs;
                    countyLabel = tempExtractedData.countyLabel;
                    countyMeshes.push(mesh);
                    this.meshesOfAllCounties.push(mesh);
                } else {
                    throw new Error('Failed to generate county mesh');
                }
            }

            if (countyAgs) {
                let meshgroupData = this.utilities.getMeshgroupBoundingBox(countyMeshes, true, this.NUMBER_OF_RANDOM_POINTS, this.MAX_RANDOM_POINT_ITERATIONS),
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

    setCameraAddControlsAndStart() {

        // check if computation performance is bad so far or if it didn't work at all
        let elapsedTime = parseFloat(this.elapsedTimeForCountyPreparation);
        if (elapsedTime === 0.0) {
            alert('Looks like something didn\'t quite work here. You can try again later and if it still doesn\'t work, try another computer.');
            throw new Error('data preparation failed');
        } else if (elapsedTime > 25.0) {
            alert('I hate to break it to you but while you were sitting there all excited I was doing some calculations and ... it\'s not looking good.' +
                '\nIt could be that your hardware is too slow or I\'m bad at math, we\'ll never know. Let\'s just call it unfortunate circumstances for now.' +
                '\n\nAs a matter of fact, it took over ' + this.elapsedTimeForCountyPreparation + ' seconds to generate some data in the background and that is bad.' +
                '\n\nIf your computer is running on battery try plugging it into a power source or ask your neighbor to use their computer 8-)')
            throw new Error('data preparation took too long (' + this.elapsedTimeForCountyPreparation + 's)');
        }

        let meshgroupData = this.utilities.getMeshgroupBoundingBox(this.meshesOfAllCounties),
            boundingBox = meshgroupData.boundingBox;

        let minY = boundingBox.minimumWorld.y,
            maxY = boundingBox.maximumWorld.y,
            {centerWorld} = boundingBox,
            height = (maxY - minY),
            fov = this.camera.fov,
            aspectRatio = this.engine.getAspectRatio(this.camera),
            distance = (height / 1.75 / aspectRatio) / Math.tan(fov / 2);

        this.camera.setTarget(centerWorld);
        this.camera.setPosition(new Vector3(centerWorld.x, centerWorld.y, centerWorld.z - distance));

        this.centerWorld = centerWorld;
        this.cameraTarget = centerWorld;

        // add custom controls for keyboard (movement) and mouse (zoom / field of view)
        this.scene.onPrePointerObservable.add(this.onMouseInput.bind(this), PointerEventTypes.POINTERWHEEL, false);
        this.scene.onKeyboardObservable.add(this.onKeyboardInput.bind(this));

        this.scene.freezeActiveMeshes();
        this.scene.freezeMaterials();

        this.startDrawingCases();
    }

    onMouseInput(pointerInfo) {
        let event = <any>pointerInfo.event;

        if (event.wheelDelta) {
            if (event.wheelDelta < 0) {
                this.camera.fov += 0.1;
            } else if (event.wheelDelta > 0 && this.camera.fov > 0.2) {
                this.camera.fov -= 0.1;
            }
        }
    }

    onKeyboardInput(kbInfo) {
        switch (kbInfo.type) {
            case KeyboardEventTypes.KEYDOWN:
                let newTarget = this.camera.getTarget();
                let key = kbInfo.event.key;
                if (key === 'ArrowUp' || key === 'w') {
                    if (newTarget.y > this.centerWorld.y + (this.CAMERA_MOVEMENT_LIMIT / 2)) {
                        return;
                    }
                    newTarget.y += this.CAMERA_MOVEMENT_SPEED;
                    this.camera.setTarget(newTarget);
                }
                if (key === 'ArrowDown' || key === 's') {
                    if (newTarget.y < this.centerWorld.y - this.CAMERA_MOVEMENT_LIMIT) {
                        return;
                    }
                    newTarget.y -= this.CAMERA_MOVEMENT_SPEED;
                    this.camera.setTarget(newTarget);
                }
                if (key === 'ArrowLeft' || key === 'a') {
                    if (newTarget.x < this.centerWorld.x - this.CAMERA_MOVEMENT_LIMIT) {
                        return;
                    }
                    newTarget.x -= this.CAMERA_MOVEMENT_SPEED;
                    this.camera.setTarget(newTarget);
                }
                if (key === 'ArrowRight' || key === 'd') {
                    if (newTarget.x > this.centerWorld.x + this.CAMERA_MOVEMENT_LIMIT) {
                        return;
                    }
                    newTarget.x += this.CAMERA_MOVEMENT_SPEED;
                    this.camera.setTarget(newTarget);
                }
                break;
        }
    }

    getCountyMesh(_corners, _material, _countyMeshInstance) {
        if (!_corners || !_corners.positions || !_corners.indices) {
            console.error(_corners);
            throw new Error('wrong corner data');
        }

        let customMesh = _countyMeshInstance.clone(),
            vertexData = new VertexData();

        vertexData.positions = _corners.positions;
        vertexData.indices = _corners.indices;

        vertexData.applyToMesh(customMesh, true);

        customMesh.enableEdgesRendering();
        customMesh.edgesWidth = 25.0;
        customMesh.edgesColor = this.countyEdgeColor;
        customMesh.doNotSyncBoundingInfo = true;
        customMesh.material = _material;
        customMesh.showBoundingBox = false;
        customMesh.alwaysSelectAsActiveMesh = true;

        return customMesh;
    }

    drawParticleSystem(_positionX, _positionY) {
        let particleSystemInstance = this.baseParticleSystemInstance.clone('particles-' + Math.random(), null);

        particleSystemInstance.particleTexture = this.particleTexture;
        particleSystemInstance.emitter = new Vector3(_positionX, _positionY, -0.5);
        particleSystemInstance.emitRate = 2;
        particleSystemInstance.updateSpeed = 0.01;
        particleSystemInstance.minSize = 0.15;
        particleSystemInstance.maxSize = 0.3;
        particleSystemInstance.addColorGradient(0, this.colorWhiteTransparent); //color at start of particle lifetime
        particleSystemInstance.addColorGradient(1, this.colorWhiteNonTransparent); //color at end of particle lifetime
        particleSystemInstance.minEmitPower = 0.5;
        particleSystemInstance.maxEmitPower = 1;
        particleSystemInstance.minLifeTime = 3;
        particleSystemInstance.maxLifeTime = 4;
        particleSystemInstance.direction1 = this.particleDirection;
        particleSystemInstance.manualEmitCount = 0;
        particleSystemInstance.start();
        // particleSystemInstance.disposeOnStop = true;

        return particleSystemInstance;
    }

    addWindowListeners() {
        window.addEventListener('resize', () => {
            if (this.engine) {
                this.engine.resize();
            }
        });

        // hide/show the Inspector using Ctrl+Alt+I
        if (this.DEBUG_MODE) {
            window.addEventListener('keydown', (_event) => {
                if (_event.ctrlKey && _event.altKey && _event.keyCode === 73) {
                    if (this.scene.debugLayer.isVisible()) {
                        this.scene.debugLayer.hide();
                    } else {
                        this.scene.debugLayer.show();
                    }
                }
            });
        }
    }
}

window.onload = function () {
    (window as any).app = new App();
};
