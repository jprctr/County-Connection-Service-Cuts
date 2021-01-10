import React, { useState, useEffect, useMemo } from 'react';
import sortBy from 'lodash.sortby';
import { group } from 'd3-array';
import { geoBounds } from 'd3-geo';
import useDimensions from 'react-use-dimensions';
import { StaticMap, NavigationControl, _MapContext as MapContext, } from 'react-map-gl';
import { fitBounds } from 'viewport-mercator-project';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, TextLayer } from '@deck.gl/layers';

import './styles.css';

// import Winter19Routeshape from './Winter19Routeshape.geo.json';
import countyconnectionRoutes from './countyconnection.geo.json';
import serviceChangeData from './countyconnection-service-cuts.json';

export const rename = {
  // '1': 'BRT/1',
};

const manualLabelPlacement = {
  // 'BSD': [-122.271168, 37.804324],
};

const serviceChanges = serviceChangeData.map(change => {
  change.line = rename[change.line] || change.line;
  // change['change-15'] = change['change-15'].trim() === '' ? 'no change' : change['change-15'];
  change['scenario-3'] = change['scenario-3'].trim() === '' ? 'no change' : change['scenario-3'];
  return change;
});
const noRouteFeatures = serviceChanges
  .filter(change => change.line.toLowerCase().includes('flex'))
  .map(change => ({
    route: change.line,
    changes: change,
  }));
const unused = [];
const ccRoutes = countyconnectionRoutes; // Routes;
const features = [...new Set(ccRoutes.features.map(f => f.properties.route_short_name))]
  .map(f => {
    const routeFeatures = ccRoutes.features.filter(r => r.properties.route_short_name === f);
    const feature = {
      type: 'Feature',  
      properties: {},
      geometry: {},
    };
    routeFeatures.forEach(route => {
      feature.properties = {
        ...route.properties,
      };
    });
    feature.geometry.coordinates = routeFeatures.map(r => r.geometry.coordinates)//.reduce((a, v) => a.push(v), []);
    feature.geometry.type = 'MultiLineString';
    return feature;
  });

// ccRoutes.features = ccRoutes.features
ccRoutes.features = features
  .map(f => {
    f.route = rename[f.properties.PUB_RTE] || f.properties.PUB_RTE || f.properties.route_short_name;
    f.changes = serviceChanges.find(r => r.line === f.route);
    if (!f.changes) {
      unused.push(f.route);
    } else {
      f.changes.area = f.properties.route_long_name;
    }
    return f;
  })
  .filter(f => f.changes); // hiding no info routes for now

const routeGeoBounds = geoBounds(ccRoutes);
ccRoutes.features = ccRoutes.features.concat(noRouteFeatures);

console.warn(`no information for: ${unused.join(', ')}`);

// from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat
function flatDeep(arr, d = 1) {
  return d > 0
    ? arr.reduce((acc, val) => acc.concat(Array.isArray(val) ? flatDeep(val, d - 1) : val), [])
    : arr.slice();
};

function overlapping(box1, box2) {
  return box1.x2 >= box2.x1 && box1.x1 <= box2.x2 && box1.y1 <= box2.y2 && box1.y2 >= box2.y1;
}

function mapToNest(map) {
  return Array.from(map, ([key, values]) => ({key, values}));
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

function getRectDimensions(position, rectWidth, rectHeight) {
  return {
    x1: position[0] - rectWidth / 2,
    y1: position[1],
    x2: position[0] + rectWidth / 2,
    y2: position[1] + rectHeight,
  };
}

export default function TransitMap(props) {
  const { changeType, selected, visibleGroups, showTransbay, colorScale, orderScale, setSearchValue, clearSelected } = props;
  const [tooltipData, setTooltipData] = useState();
  const [ref, { x, y, width, height }] = useDimensions();

  const defaultViewState = useMemo(() => {
    const viewState = fitBounds({
      bounds: routeGeoBounds,
      width: width || 100,
      height: height || 100,
      padding: 16,
    });
    viewState.bearing = 0;
    viewState.pitch = 0;
    return viewState;
  }, [width, height]);

  const routes = useMemo(() => {
    const size = 0.007;//2; //0.0075; // 0.0072; // min: 0.005;
    const rectHeight = size / 3 * 4;
    const labelPositions = [];

    return (
      sortBy(
        sortBy(
          ccRoutes.features.map(f => {
            f.scaleKey = f.changes ? f.changes[changeType].trim() : 'other';
            f.color = colorScale(f.scaleKey);
            f.order = orderScale(f.scaleKey);
            return f;
          })
        , f => -f.route)
      , f => f.order)
      .map(f => {
        if (f.geometry) {
          const rectWidth = Math.max(rectHeight, rectHeight / 2 * f.route.length);
          const flatCoordinates = flatDeep(f.geometry.coordinates.slice(), Infinity);
          f.start = manualLabelPlacement[f.route] ? manualLabelPlacement[f.route] : flatCoordinates.slice(0, 2);
          let position = f.start;
          let usedPositon = labelPositions.find(lp => overlapping(lp, getRectDimensions(position, rectWidth, rectHeight)));

          while (usedPositon) {
            flatCoordinates.splice(0, 2);
            let pos = f.start;
            if (flatCoordinates.length >= 2) {
              pos = flatCoordinates.slice(0, 2);
              usedPositon = labelPositions.find(lp => overlapping(lp, getRectDimensions(pos, rectWidth, rectHeight)));
            } else {
              console.log(`default: ${f.route}`);
              usedPositon = false;
            }
            position = pos;
          }

          labelPositions.push(getRectDimensions(position, rectWidth, rectHeight));
          f.labelPos = position;
        }
        return f;
      }) 
    );
  }, [changeType, colorScale, orderScale]);

  const displayRoutes = useMemo(() => (
    routes.filter(route => (
      visibleGroups.includes(route.scaleKey) && (showTransbay || !route.changes.area.toLowerCase().includes('transbay')) && route.geometry
    ))
  ), [routes, visibleGroups, showTransbay]);

  const routesByGroup = useMemo(() => (
    mapToNest(group(displayRoutes, route => route.scaleKey))
  ), [displayRoutes]);

  const updateTooltip = useMemo(() => (
    function(datum, fromMap = false) {
      const { route, scaleKey, color, order, changes } = datum;
      const status = scaleKey;
      const { area, group, description } = changes;
      if (fromMap) {
        setSearchValue(route);
      }
      setTooltipData({
        route,
        color,
        order,
        area,
        group,
        description,
        status,
        datum: datum.geometry ? datum : null,
      });
    }
  ), [setSearchValue]);

  useEffect(() => {
    const datum = routes.find(r => r.route === selected);
    if (datum) {
      updateTooltip(datum);
    } else {
      setTooltipData(null);
    }
  }, [updateTooltip, selected, routes, x, y ]);

  function clearSelection() {
    if (selected !== '') {
      clearSelected();
    }
    if (tooltipData) {
      setTooltipData(null);  
    }
  }

  function hoverLine(target) {
    const { object } = target;
    if (object) {
      const { route } = object;
      const datum = routes.filter(r => (
        visibleGroups.includes(r.scaleKey) && (showTransbay || !r.changes.area.toLowerCase().includes('transbay'))
      )).find(r => r.route === route);
      if (datum) {
        if (!tooltipData || tooltipData.route !== route) {
          updateTooltip(datum, true);
        }
      }
    } else {
      clearSelection();
    }
  }

  const textLayers = routesByGroup.map(group => {      
    return new TextLayer({
      id: `${group.key}-route-labels-background`,
      data: group.values,
      pickable: false,
      getText: route => route.route,
      getPosition: route => route.labelPos,
      opacity: selected ? 0.025 : 1,
      getColor: [0, 0, 0],
      backgroundColor: hexToRgb(colorScale(group.key)),
      sizeMinPixels: 0,
      sizeMaxPixels: 28, //30,
      fontFamily: 'Fira Sans, sans-serif',
      fontWeight: 500,
      sizeUnits: 'meters',
      sizeScale: 36,
      parameters: {
        depthTest: false,
      },
    });
  }).concat(routesByGroup.map(group => {      
    return new TextLayer({
      id: `${group.key}-route-labels`,
      data: group.values,
      pickable: true,
      onHover: hoverLine,
      getText: route => route.route,
      getPosition: route => route.labelPos,
      opacity: selected ? 0.025 : 1,
      getColor: [255, 255, 255],
      backgroundColor: [18, 18, 18],
      sizeMinPixels: 0,
      sizeMaxPixels: 24,
      fontFamily: 'Fira Sans, sans-serif',
      fontWeight: 500,
      sizeUnits: 'meters',
      sizeScale: 32,
      parameters: {
        depthTest: false,
      },
    });
  }));

  const highlightLayers = tooltipData && tooltipData.datum ? [
    new GeoJsonLayer({
      id: `${tooltipData.datum.scaleKey}-route-background`,
      data: [tooltipData.datum],
      stroked: true,
      filled: false,
      pickable: false,
      lineJointRounded: true, 
      lineWidthMinPixels: 4,
      lineWidthMaxPixels: 16,
      getLineWidth: 12,
      getFillColor: [0, 0, 0, 255],
      getLineColor: [255, 255, 255],
      parameters: {
        depthTest: false,
      },
    }),
    new GeoJsonLayer({
      id: `${tooltipData.datum.scaleKey}-route`,
      data: [tooltipData.datum],
      stroked: true,
      filled: false,
      pickable: false,
      lineJointRounded: true,
      lineWidthMinPixels: 2,
      lineWidthMaxPixels: 12,
      getLineWidth: 10,
      getFillColor: [0, 0, 0, 255],
      getLineColor: route => hexToRgb(colorScale(route.scaleKey)),
      parameters: {
        depthTest: false,
      },
    }),
    new TextLayer({
      id: `${tooltipData.datum.scaleKey}-highlight-label-background`,
      data: [tooltipData.datum],
      pickable: false,
      getText: route => route.route,
      getPosition: route => route.labelPos,
      getColor: [0, 0, 0],
      backgroundColor: hexToRgb(colorScale(tooltipData.datum.scaleKey)),
      sizeMinPixels: 20,
      sizeMaxPixels: 36,
      fontFamily: 'Fira Sans, sans-serif',
      fontWeight: 500,
      sizeUnits: 'meters',
      sizeScale: 45,
      parameters: {
        depthTest: false,
      },
    }),
    new TextLayer({
      id: `${tooltipData.datum.scaleKey}-highlight-label`,
      data: [tooltipData.datum],
      pickable: false,
      getText: route => route.route,
      getPosition: route => route.labelPos,
      getColor: [255, 255, 255],
      backgroundColor: [18, 18, 18],
      sizeMinPixels: 16,
      sizeMaxPixels: 32,
      fontFamily: 'Fira Sans, sans-serif',
      fontWeight: 500,
      sizeUnits: 'meters',
      sizeScale: 40,
      parameters: {
        depthTest: false,
      },
    }),
  ] : [];

  const layers = [
    new GeoJsonLayer({
      id: 'routes',
      data: displayRoutes,
      stroked: true,
      filled: false,
      pickable: true,
      lineJointRounded: true,
      lineWidthMinPixels: 1.5,
      lineWidthMaxPixels: 5,
      opacity: selected ? 0.005 : 1,
      getLineWidth: 10,
      getFillColor: [0, 0, 0],
      getLineColor: route => hexToRgb(colorScale(route.scaleKey)),
      onHover: hoverLine,
      parameters: {
        depthTest: false,
      },
    }),
    ...textLayers,
    ...highlightLayers,
  ];

  return (
    <div ref={ref} className="TransitMap">
      <DeckGL
        layers={layers}
        pickingRadius={8}
        initialViewState={defaultViewState}
        controller={true}
        getCursor={() => tooltipData ? 'pointer' : 'grab'}
        ContextProvider={MapContext.Provider}
      >    
        <StaticMap
          mapStyle="mapbox://styles/jprctr/ckf7hqkbl2caw19nw1abtzh3c"
          mapboxApiAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
          preventStyleDiffing={true}
          reuseMaps
        />
        <div className="navigationControl">
          <NavigationControl showCompass={false} />
        </div>
      </DeckGL>
      <div
        className='tooltip'
        style={{ borderColor: tooltipData ? tooltipData.color : 'white', opacity: tooltipData ? 1 : 0 }}
      >
        <div className='column left'>
          <div className='row'>
            <div className='route left'>
              <span>
                {tooltipData ? tooltipData.route : ''}
              </span>
            </div>
            <div className='area right'>
              <span>
                {tooltipData ? tooltipData.area : ''}
              </span>
            </div>
          </div>
          <div className='row'>
            <div className='status left'>
              <span>
                {tooltipData ? tooltipData.status : ''}
              </span>
            </div>
            <div className='group right'>
              <span>
                {tooltipData ? tooltipData.group : ''}
              </span>
            </div>
          </div>
        </div>
        <div className='column right'>
          <div className='row description'>
            <div>
              <span>
                {tooltipData ? tooltipData.description : ''}
              </span>
            </div>
          </div>
        </div>
        <div
          className='close'
          style={{ borderColor: tooltipData ? tooltipData.color : 'white' }}
          onClick={clearSelection}
        >
          <div>x</div>
        </div>
      </div>
    </div>
  );
}
