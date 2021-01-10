import React, { useState, useEffect } from 'react';
import { scaleOrdinal } from 'd3-scale';
import sortBy from 'lodash.sortby';
import Autosuggest from 'react-autosuggest';
import useDimensions from 'react-use-dimensions';
import { Toggle } from "react-toggle-component";

import TransitMap, { rename } from './TransitMap'
import serviceChanges from './TransitMap/countyconnection-service-cuts.json';

import './App.css';

const typesInOrder = ['other', 'no change', 'modified', 'reduced', 'eliminated']; // 'increased', 

const colorScale = scaleOrdinal()
  .domain(typesInOrder)
  .range(['#a8aaac', '#10684e', '#ffc75f', '#ff9671', '#CC0000']); // '#008e9b', 

const orderScale = scaleOrdinal()
  .domain(typesInOrder)
  .range([1, 2, 3, 4, 5, 6]);

const changeType = 'scenario-3';
const routes = sortBy(
  sortBy(
    serviceChanges.map(route => {
      route.route = rename[route.line] || route.line;
      route.scaleKey = route[changeType].trim();
      route.scaleKey = route.scaleKey === '' ? 'no change' : route.scaleKey;
      route.color = colorScale(route.scaleKey);
      route.order = orderScale(route.scaleKey);
      return route;
    }).filter(change => change.line !== '40-duplicate')
  ,r => isNaN(parseInt(r.route)) ? r.route : parseInt(r.route))
,r => -r.order);

const getSuggestions = (value, visibleGroups, transbay) => {
  const inputValue = value.trim().toLowerCase();
  const inputLength = inputValue.length;
  return inputLength === 0
    ? routes
    : routes.filter(route => (
      route.route.toLowerCase().includes(inputValue) && (transbay || !route.area.toLowerCase().includes('transbay'))
    ));
};

const getSuggestionValue = suggestion => suggestion.route;

function App() {
  const [value, setValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState(routes);
  const [visibleGroups, setVisibleGroups] = useState(typesInOrder);
  const [showTransbay, setShowTransbay] = useState(true);
  const [ref, { width }] = useDimensions();

  useEffect(() => {
    setValue(searchValue);
    setSuggestions(getSuggestions(searchValue, visibleGroups, showTransbay));
  }, [searchValue, visibleGroups, showTransbay]);

  function clearSelected() {
    setValue('');
    setSearchValue('');
    setSuggestions(getSuggestions('', visibleGroups, showTransbay));
  }

  function updateGroups(id) {
    setVisibleGroups(groups => {
      if (groups.includes(id)) {
        const nextGroups = groups.slice().filter(group => group !== id);
        return nextGroups.length ? nextGroups : [];
      } else {
        return groups.concat([id]);
      }
    });
  }

  const renderSuggestion = (suggestion) => {
    const isSelected = suggestion.route === value;
    return (
      <div
        className={`suggestion ${isSelected ? 'selected' : ''}`}
        data-route={suggestion.route}
        style={{ borderColor: suggestion.color }}
      >
        <div className='label'>
          {suggestion.route}
        </div>
        <div className='status'>
          {suggestion.scaleKey}
        </div>
      </div>
    );
  };

  return (
    <div ref={ref} className="App">
      <div className='panel'>
        <div className='headings'>
          <div className='title'>
            Proposed County Connection Service Cuts 
          </div>
          <div className='subtitle'>
            2021 Scenario 3
          </div>
          <div className='source'>
            <span>
              Based on <a href='https://countyconnection.com/2021-service-plan/' target='_blank' rel='noopener noreferrer'>County Connection 2021 Service Plan Proposals</a>
            </span>
          </div>
        </div>
        {
        // <div className='transbayToggle'>
        //   <Toggle
        //     name='transbayLines'
        //     className='toggle'
        //     checked={showTransbay}
        //     onChange={e => setShowTransbay(e.target.checked)}
        //     leftBackgroundColor='#121212'
        //     rightBackgroundColor='#10684e'
        //     borderColor='none'
        //     knobColor='#ffffff'
        //     borderWidth='0.25em'
        //     width='2.7em'
        //     height='1.65em'
        //     knobWidth='1em'
        //     knobHeight='1em'
        //     knobRadius='0.5em'
        //   />
        //   <label className='label' htmlFor='transbayLines'>
        //     {showTransbay ? 'Showing' : 'Hiding'} Transbay Services
        //   </label>
        // </div>
      }
        <div className='legend'>
          {typesInOrder.filter(t => t !== 'other').reverse().map(t => (
            <div
              key={t}
              className='item'
              onClick={() => updateGroups(t)}
              style={{ opacity: visibleGroups.includes(t) ? 1 : 0.25 }}
            >
              <div className='swatch' style={{ background: colorScale(t) }}/>
              <div className='label'>
                {t}
              </div>
            </div>
          ))}
        </div>
        <div
          className='search'
          onMouseMove={e => {
            const { target } = e;
            const { dataset } = target;
            const { route } = dataset;
            if (route) {
              setValue(route);
            }
          }}
        >
          <Autosuggest
            focusInputOnSuggestionClick={false}
            alwaysRenderSuggestions={width > 768}
            suggestions={suggestions.filter(route => (
              visibleGroups.includes(route.scaleKey) && (showTransbay || !route.area.toLowerCase().includes('transbay'))
            ))}
            onSuggestionsFetchRequested={({ value }) => setSuggestions(getSuggestions(value, visibleGroups, showTransbay))}
            onSuggestionsClearRequested={() => {}}
            getSuggestionValue={getSuggestionValue}
            renderSuggestion={suggestion => renderSuggestion(suggestion)}
            shouldRenderSuggestions={() => true}
            inputProps={{
              placeholder: 'Search',
              value,
              onChange: (e, { newValue }) => setValue(newValue),
            }}
          />
        </div>
      </div>
      <TransitMap
        changeType={changeType}
        selected={value}
        clearSelected={clearSelected}
        visibleGroups={visibleGroups}
        showTransbay={showTransbay}
        colorScale={colorScale}
        orderScale={orderScale}
        setSearchValue={setSearchValue}
      />
    </div>
  );
}

export default App;
