import * as d3 from 'd3';

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
            maxDate = Date.parse('2021/01/01'),
            minDate = Date.parse('2020/01/26'),
            isBeforeMinDate = true,
            totalCases = 0,
            date, feature, properties;

        for (let i = 0; i < _data.length; i++) {
            feature = _data[i];
            properties = feature.properties;
            properties.IdLandkreis = this.getCountyKey(properties.IdLandkreis);

            date = Date.parse(properties.Meldedatum.substring(0, 10));
            if (date >= maxDate) {
                continue;
            }

            // fix wrong data
            if (isBeforeMinDate && date < minDate) {
                properties.AnzahlFall = 0;
                isBeforeMinDate = false; // prevent date comparison after passing min date
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
}
