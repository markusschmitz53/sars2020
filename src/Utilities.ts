import * as d3 from 'd3';
import * as earcut from 'earcut';
import {Mesh, Vector3} from '@babylonjs/core';
import {MeshgroupData} from './Types';

export class Utilities {
    private totalCaseCount;
    private readonly targetCaseCount;

    constructor() {
        this.totalCaseCount = 0;
        this.targetCaseCount = 1891581;
    }

    getTotalCaseCount() {
        return this.totalCaseCount;
    }

    getTargetCaseCount() {
        return this.targetCaseCount;
    }

    /**
     * @see https://observablehq.com/@sto3psl/map-of-germany-in-d3-js
     */
    getProjection(_geoBounds) {
        let bottomLeft = _geoBounds[0],
            topRight = _geoBounds[1],
            rotLong = -(topRight[0] + bottomLeft[0]) / 3,
            centerX = (topRight[0] + bottomLeft[0]) / 2 + rotLong,
            centerY = (topRight[1] + bottomLeft[1]) / 2;

        return d3.geoAlbers()
            .rotate([rotLong, 0, 0])
            .center([centerX, centerY]);
    }

    formatDateToGerman(_date) {
        let year = _date.slice(0, 4),
            month = _date.slice(5, 7),
            day = _date.slice(8, 10);

        return day + '.' + month + '.' + year;
    }

    fadeOut(element, callback) {
        let op = 1;  // initial opacity
        let timer = setInterval(function () {
            if (op <= 0.05) {
                clearInterval(timer);
                element.style.display = 'none';
                callback();
            }
            element.style.opacity = op;
            element.style.filter = 'alpha(opacity=' + op * 100 + ")";
            op -= op * 0.025;
        }, 10);
    }

    fadeIn(element, callback) {
        let op = 0.01;  // initial opacity
        element.style.display = 'block';
        let timer = setInterval(function () {
            if (op >= 1) {
                clearInterval(timer);
                callback();
            }

            element.style.setProperty('opacity', op);
            element.style.setProperty('filter', 'alpha(opacity=' + op * 100 + ")");
            op += op * 0.025;
        }, 10);
    }

    sleep(ms: number) {
        return new Promise(resolve => {
                setTimeout(resolve, ms);
            }
        );
    }

    fixCasesAndGroupByDate(_data) {
        let sortedData = [],
            totalCases = 0,
            date, feature, properties;

        for (let i = 0; i < _data.length; i++) {
            feature = _data[i];
            properties = feature.properties;
            properties.IdLandkreis = this.getCountyKey(properties.IdLandkreis);

            date = properties.Meldedatum.slice(0, 10);

            if (date >= '2021-01-01') {
                continue;
            }

            // remove cases before the offical first case
            if (date < '2020-01-27') {
                properties.AnzahlFall = 0;
            }

            if (!sortedData[date]) {
                sortedData[date] = [];
            }

            totalCases += properties.AnzahlFall;

            sortedData[date].push(feature);
        }

        this.totalCaseCount = totalCases;

        return sortedData;
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

    sortCasesByDate(_a, _b) {
        return (_a.properties.Meldedatum < _b.properties.Meldedatum) ? -1 : ((_a.properties.Meldedatum > _b.properties.Meldedatum) ? 1 : 0);
    }

    startProcess(_hint) {
        console.info(_hint);
        return performance.now();
    }

    stopProcess(performanceValueT0, _hint) {
        let timeDifference = ((performance.now() - performanceValueT0) / 1000).toFixed(1);
        console.info(_hint + ' (' + timeDifference + 's)');

        return timeDifference;
    }

    getMeshgroupBoundingBox(_meshgroup: Mesh[], _withRandomPoints = false, _numberOfPoints?, _pointInterationLimit?) {
        let meshGroupClone = [],
            randomPoints = [],
            data: MeshgroupData = {
                boundingBox: {},
                randomPoints: {}
            },
            i, k, randomPoint, iterations, maxX, minX, maxY, minY, x, y;

        for (i = 0; i < _meshgroup.length; i++) {
            meshGroupClone.push(_meshgroup[i].clone("clone"));
        }

        // merge all meshes to one group and get the bounding box
        let mergedMesh = Mesh.MergeMeshes(meshGroupClone, true, true),
            {boundingBox} = mergedMesh.getBoundingInfo();

        mergedMesh.isVisible = false;

        for (k = meshGroupClone.length; k > 0; k--) {
            meshGroupClone[k - 1].dispose();
        }

        maxX = boundingBox.maximum.x;
        minX = boundingBox.minimum.x;
        maxY = boundingBox.maximum.y;
        minY = boundingBox.minimum.y;

        // generate random points within the bounding box of the mesh
        if (_withRandomPoints) {
            for (i = 0; i < _numberOfPoints; i++) {
                iterations = 0;
                do {
                    x = (Math.random() * (maxX - minX) + minX);
                    y = (Math.random() * (maxY - minY) + minY);

                    randomPoint = new Vector3(x, y, boundingBox.center.z);
                    ++iterations;

                    if (iterations > _pointInterationLimit) {
                        console.error("check iterations on random points");
                        break;
                    }
                }
                while (!mergedMesh.intersectsPoint(randomPoint));
                randomPoints.push(randomPoint);
            }

            if (randomPoints.length === 0) {
                console.error('setting fallback vector for particle system position');
                randomPoints.push(new Vector3(boundingBox.center.x, boundingBox.center.y, boundingBox.center.z));
            }
        }

        mergedMesh.dispose();

        data.boundingBox = boundingBox;
        data.randomPoints = randomPoints;

        return data;
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

        let indices = earcut(coordinates, _geometry.holes, _geometry.dimensions),
            zCoordinate = 0,
            i;

        // add z-coordinate for all points. coordinates array has the form [x1,y1,x2,y2,x3,y3...]
        for (i = 2; i < coordinates.length; i += 3) {
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
}
