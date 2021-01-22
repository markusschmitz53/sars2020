# sars2020

## About
This project shows an animation of all registered SARS-CoV2 cases in Germany throughout 2020. The
 cases are displayed per county using [GeoJSON](https://geojson.org/) data.

## About The Data
Data from [npgeo-corona-npgeo-de.hub.arcgis.com](https://npgeo-corona-npgeo-de.hub.arcgis.com/datasets/dd4580c810204019a7b8eb3e0b329dd6_0) is used for the covid cases.
Some corrections to the data had to be made as it is [pretty flawed](https://www.ndr.de/nachrichten/info/Corona-Faelle-schon-im-Januar-Daten-unter-der-Lupe,falscheserkrankungsdatum100.html).
I removed all reported cases before the 28th of January 2020 as the first case was reported on that day and [confirmed the day before](https://www.stmgp.bayern.de/presse/bestaetigter-coronavirus-fall-in-bayern-infektionsschutzmassnahmen-laufen/).

Due to [problems with reporting](https://de.wikipedia.org/wiki/COVID-19-Pandemie_in_Deutschland/Statistik#Anmerkungen), the total number of cases differes
from the official number of cumulative cases for the year 2020. To compensate for this fact, the remaining cases are distributed over the year.
The distribution is weighted by taking into account the number of infections in a given time frame. I thought that this is a slightly
better approach then distribution the cases equally or even randomly over the year.

## About The Code
The basis for this project is [babylon.js](https://www.babylonjs.com/). It was recommended to me by a friend and I have so say that I really enjoy it.
Easy to learn and [lightning fast](https://www.youtube.com/watch?v=Xw1k20DpHfA).

The necessary triangulation is done using the [earcut](https://github.com/mapbox/earcut) library and geoprojection with the awesome [d3-geo](https://github.com/d3/d3-geo).


## <a id="acknowledgements-and-sources">Acknowledgements And Sources</a>
Covid case data by [Robert Koch-Institut (RKI)](https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Fallzahlen.html) [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)
County data was generated using [GeoJSON Utilities](http://opendatalab.de/projects/geojson-utilities/)  

## Disclaimer
The content provided through this project is an artistic representation of covid case data based on scientific facts.

I assume no responsibility for the correctness and completeness of the information as well as unauthorized modification of the information by third parties.

https://npgeo-corona-npgeo-de.hub.arcgis.com/datasets/dd4580c810204019a7b8eb3e0b329dd6_0
https://github.com/isellsoap/deutschlandGeoJSON/blob/master/4_kreise/4_niedrig.geo.json
https://observablehq.com/@niamleeson/how-to-render-geojson-on-babylon-js
http://opendatalab.de/projects/geojson-utilities/

https://observablehq.com/@scarysize/finding-random-points-in-a-polygon

cases start 28.01.2020

AGS = Allgemeiner Gemeinde Schlüssel
