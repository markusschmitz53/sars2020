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

    formatDate(_date) {
        let year = _date.substr(0, 4),
            month = _date.substr(5,2),
            day = _date.substr(8,2);

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
            date, feature;

        for (let i = 0; i < _data.length; i++) {
            feature = _data[i];
            date = feature.properties.Meldedatum.substring(0, 10);
            if (date >= '2021/01/01') {
                continue;
            }

            // fix wrong data
            if (date < '2020/01/28') {
                feature.properties.AnzahlFall = 0;
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
