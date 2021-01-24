# sars2020

The website shows an animation of all registered SARS-CoV2 cases in Germany throughout the year 2020. The
 cases are shown over time per county using open source data.  
  
Cases start on the 28th of January 2020.

## About The Data
I'm using data from [npgeo-corona-npgeo-de.hub.arcgis.com](https://npgeo-corona-npgeo-de.hub.arcgis.com/datasets/dd4580c810204019a7b8eb3e0b329dd6_0) for the covid cases.
Some corrections to the data had to be made as it is [pretty flawed](https://www.ndr.de/nachrichten/info/Corona-Faelle-schon-im-Januar-Daten-unter-der-Lupe,falscheserkrankungsdatum100.html).
I removed all reported cases before the 28th of January 2020 as the first case was reported on that day and [confirmed the day before](https://www.stmgp.bayern.de/presse/bestaetigter-coronavirus-fall-in-bayern-infektionsschutzmassnahmen-laufen/).  

Due to [problems with reporting](https://de.wikipedia.org/wiki/COVID-19-Pandemie_in_Deutschland/Statistik#Anmerkungen), the total number of cases differs
from the official number of cumulative cases for the year 2020. To compensate for this fact, the number of cumulative cases shown in the animation is increased
towards the end of the year.

In order to draw the counties and match them to covid case records, I generated some [GeoJSON](https://geojson.org/) enriched with data from wikipedia. It includes the
counties names as well as the municipality code (*AGS = Allgemeiner Gemeinde Schlüssel*) using [GeoJSON Utilities](http://opendatalab.de/projects/geojson-utilities/).

## About The Code
The project is created using [babylon.js](https://www.babylonjs.com/).

The first step is generating and drawing the counties. The [GeoJSON](https://geojson.org/) data is loaded and projected on to
the canvas. The [necessary triangulation](https://en.wikipedia.org/wiki/Triangulation_(computer_vision)) is done using [earcut](https://github.com/mapbox/earcut) library and geo projection using [d3-geo](https://github.com/d3/d3-geo).
I took a lot of inspiration from [this great tutorial](https://observablehq.com/@niamleeson/how-to-render-geojson-on-babylon-js) by Jay Kim and [this one](https://observablehq.com/@sto3psl/map-of-germany-in-d3-js)
by Fabian Gündel. 

Each county is drawn as a separate mesh together with it's own particle system. I'm using particle systems to emit
particles for each case per county (performance reasons). At first the spawn point was the center of the bounding box
but that didn't look good so I try to calculate some random points inside the mesh now and move the particle system around.
**The calculation of these points seems to be not quite right, so you see some cases floating outside of the borders**.

The covid case records are loaded, sorted and grouped by date. Reported cases before the 27th of January are set to zero.

While drawing the cases for each day, execution time is measured. If the process was too fast, execution is paused for
the time difference (*minimum execution time - real execution time*) to display each day long enough and for the DOM 
changes to be rendered.

The keyboard and mouse movement is pretty janky since I just add to the camera target vector without lerping
or animation but who cares, right?

There are many things I really would've liked to improve, but it's just a weekend project after all ...

### Drawing counties

Each county is rendered as a separate [polygon mesh](https://en.wikipedia.org/wiki/Polygon_mesh). It's center point
is determined using the [bounding box](https://en.wikipedia.org/wiki/Minimum_bounding_box). I'm generating a number of 
random points within the bounding box to emit particles from later on. **This is also why some of the case particles
float outside of the borders.** 
An array of all drawn counties is 
created in the process which also includes the counties name, the center point of the mesh,  

### Drawing covid cases

WHY ARE SOME CASES FLOATING OUTSIDE OF GERMANY??

## <a id="acknowledgements-and-sources">Acknowledgements And Sources</a>
Covid case data by [Robert Koch-Institut (RKI)](https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Fallzahlen.html) [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)   
County data was generated using [GeoJSON Utilities](http://opendatalab.de/projects/geojson-utilities/)  

## Disclaimer And Contact
The content provided through this project is an artistic representation of open source covid case data. I made some adjustments
(see above) based on scientific facts and official reports.

I assume no responsibility for the correctness and completeness of the information provided as well as unauthorized modification of the information by third parties.

You can get in touch with me via vagrant-angora@maskmail.net
