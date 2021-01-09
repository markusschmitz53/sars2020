import * as d3 from 'd3';

export class Utilities {
    private performanceValueT0;

    constructor() {
    }

    /**
     * @see https://observablehq.com/@sto3psl/map-of-germany-in-d3-js
     */
    getProjection(_geoBounds) {
        let bottomLeft = _geoBounds[0],
            topRight = _geoBounds[1],
            rotLong = -(topRight[0] + bottomLeft[0]) / 2,
            centerX = (topRight[0] + bottomLeft[0]) / 2 + rotLong,
            centerY = (topRight[1] + bottomLeft[1]) / 2;

        return d3.geoAlbers()
            .rotate([rotLong, 0, 0])
            .center([centerX, centerY]);
    }

    sleep(ms: number) {
        return new Promise(resolve => {
                setTimeout(resolve, ms);
            }
        );
    }

    groupCasesByDate(_data) {
        let sortedData = [],
            date, feature;

        for (let i = 0; i < _data.length; i++) {
            feature = _data[i];
            date = feature.properties.Meldedatum.substring(0, 10);
            if (date >= '2021-01-01') {
                continue;
            }
            if (!sortedData[date]) {
                sortedData[date] = [];
            }

            sortedData[date].push(feature);
        }

        return sortedData;
    }

    sortCasesByDate(_a, _b) {
        return (_a.properties.Meldedatum < _b.properties.Meldedatum) ? -1 : ((_a.properties.Meldedatum > _b.properties.Meldedatum) ? 1 : 0);
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
}
