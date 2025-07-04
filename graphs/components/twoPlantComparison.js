import { graphConfig } from '../config/graphConfig.js';
import { showToast } from './toast.js';
import { legendTooltips, tooltipStyle } from '../config/tooltipConfig.js';

const LEGEND_THRESHOLD_PERCENTAGE = 0;
const LEGEND_WIDTH = 80;

// Common legend configuration
const commonLegendConfig = {
    position: 'left',
    align: 'start',
    x: 0,
    maxWidth: LEGEND_WIDTH,
    width: LEGEND_WIDTH,
    labels: {
        boxWidth: 12,
        boxHeight: 12,
        padding: 8,
        font: {
            size: 11
        }
    },
    onHover: function(event, legendItem, legend) {
        event.native.target.style.cursor = 'pointer';
        // Checkfor production type tooltips
        let tooltip = legendTooltips.productionTypes[legendItem.text];
        
        // If not found, check for price tooltips
        if (!tooltip) {
            tooltip = legendTooltips.prices[legendItem.text];
        }
        
        // If still not found, check for fuel type tooltips
        if (!tooltip) {
            tooltip = legendTooltips.production[legendItem.text];
        }

        if (tooltip) {
            let tooltipEl = document.getElementById('chart-tooltip');
            if (!tooltipEl) {
                tooltipEl = document.createElement('div');
                tooltipEl.id = 'chart-tooltip';
                tooltipEl.style.cssText = tooltipStyle;
                document.body.appendChild(tooltipEl);
            }

            const mouseX = event.native.clientX;
            const mouseY = event.native.clientY;

            tooltipEl.innerHTML = tooltip;
            tooltipEl.style.left = (mouseX + 10) + 'px';
            tooltipEl.style.top = (mouseY + 10) + 'px';
            tooltipEl.style.display = 'block';
        }
    },
    onLeave: function(event) {
       if (event?.native?.target) {
            event.native.target.style.cursor = 'default';
        }
        const tooltipEl = document.getElementById('chart-tooltip');
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
        }
    },
    onClick: function(e, legendItem, legend) {
        const chartType = legend.chart.config.type === 'bar' ? 'totalProduction' :
                         legend.chart.options.plugins.title.text.includes('Price') ? 'price' : 
                         'production';
        clickHandlers[chartType](legend.chart, legendItem.datasetIndex);
    }
};

// Add click handlers at the module level
const clickHandlers = {
    production: createClickHandler('production'),
    price: createClickHandler('price'),
    totalProduction: createClickHandler('totalProduction')
};

function createClickHandler(chartType) {
    let clickTimeout = null;
    let clickCount = 0;

    return function(chart, datasetIndex) {
        clickCount++;
        
        if (clickCount === 1) {
            clickTimeout = setTimeout(() => {
                // Single click behavior
                const meta = chart.getDatasetMeta(datasetIndex);
                meta.hidden = !meta.hidden;
                chart.update();
                clickCount = 0;
            }, 250);
        } else if (clickCount === 2) {
            clearTimeout(clickTimeout);
            // Double click behavior
            const datasets = chart.data.datasets;
            
            // If all others are already hidden, show all (reset)
            const allOthersHidden = datasets.every((dataset, i) => 
                i === datasetIndex || chart.getDatasetMeta(i).hidden);
            
            datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                meta.hidden = !allOthersHidden && (i !== datasetIndex);
            });
            
            chart.update();
            clickCount = 0;
        }
    };
}

export function createTwoPlantComparison(data, validForsyids) {
    // Input validation
    if (!data || !validForsyids || validForsyids.length !== 2) {
        console.error('Invalid parameters for two plant comparison');
        return;
    }

    const graphContainer = document.getElementById('graph-container');
    if (!graphContainer) {
        console.error('Graph container not found');
        return;
    }

    // Store chart instances for cleanup
    const charts = [];

    // Clear existing content and create two-plant container
    graphContainer.innerHTML = `
        <div class="two-plant-container">
            <div class="plant-column">
                <h2 class="graph-title"></h2>
                <div class="production-graph">
                    <canvas id="productionChart1"></canvas>
                </div>
                <div class="total-production-graph">
                    <canvas id="totalProductionChart1"></canvas>
                </div>
                <div class="price-graph">
                    <canvas id="priceChart1"></canvas>
                </div>
                <div class="info-box"></div>
            </div>
            <div class="plant-column">
                <h2 class="graph-title"></h2>
                <div class="production-graph">
                    <canvas id="productionChart2"></canvas>
                </div>
                <div class="total-production-graph">
                    <canvas id="totalProductionChart2"></canvas>
                </div>
                <div class="price-graph">
                    <canvas id="priceChart2"></canvas>
                </div>
                <div class="info-box"></div>
            </div>
        </div>
    `;

    // Calculate max values across both plants before creating charts
    const maxValues = {
        production: {},
        prices: {
            mwh_price: 0,
            apartment_price: 0,
            house_price: 0
        }
    };

    // Calculate max production values for each fuel type
    validForsyids.forEach(forsyid => {
        const plantId = forsyid.toString().padStart(8, '0');
        const plantData = data[plantId];
        
        if (plantData?.production) {
            Object.keys(plantData.production).forEach(year => {
                Object.entries(plantData.production[year]).forEach(([key, value]) => {
                    maxValues.production[key] = Math.max(
                        maxValues.production[key] || 0,
                        value || 0
                    );
                });
            });
        }

        if (plantData?.prices) {
            Object.values(plantData.prices).forEach(yearPrices => {
                maxValues.prices.mwh_price = Math.max(
                    maxValues.prices.mwh_price,
                    yearPrices.mwh_price || 0
                );
                maxValues.prices.apartment_price = Math.max(
                    maxValues.prices.apartment_price,
                    yearPrices.apartment_price || 0
                );
                maxValues.prices.house_price = Math.max(
                    maxValues.prices.house_price,
                    yearPrices.house_price || 0
                );
            });
        }
    });

    // Calculate max production value across both plants
    let maxProductionValue = 0;
    validForsyids.forEach(forsyid => {
        const plantId = forsyid.toString().padStart(8, '0');
        const plantData = data[plantId];
        
        if (plantData?.production) {
            Object.keys(plantData.production).forEach(year => {
                const yearTotal = (plantData.production[year]?.varmeprod || 0) + 
                                (plantData.production[year]?.elprod || 0);
                maxProductionValue = Math.max(maxProductionValue, yearTotal);
            });
        }
    });

    // Create charts for both plants with shared max values
    validForsyids.forEach((forsyid, index) => {
        const plantId = forsyid.toString().padStart(8, '0');
        const plantData = data[plantId];

        if (!plantData?.production) {
            showToast(`No data available for plant ${index + 1}`);
            return;
        }

        const column = graphContainer.querySelector(`.plant-column:nth-child(${index + 1})`);
        
        // Set plant title
        const titleElement = column.querySelector('.graph-title');
        titleElement.textContent = plantData.name || `Plant ${index + 1}`;

        // Create and store chart instances with shared max values
        charts.push(createProductionChart(plantData, index + 1, maxProductionValue));
        charts.push(createPriceChart(plantData, index + 1, maxValues.prices));
        charts.push(createTotalProductionChart(plantData, index + 1, maxProductionValue));

        updateInfoBox(plantData, index + 1);
    });

    // Return cleanup function
    return function cleanup() {
        charts.forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        graphContainer.innerHTML = '';
    };
}

function createProductionChart(plantData, index, maxValue) {
    const ctx = document.getElementById(`productionChart${index}`).getContext('2d');
    
    const productionYears = Object.keys(plantData.production)
        .filter(year => !isNaN(parseInt(year)))
        .sort();

    // Create datasets for each category using the fuelTypes mapping
    const datasets = Object.entries(graphConfig.fuelTypes).map(([category, fuelTypes]) => {
        const values = productionYears.map(year => {
            // Get the total production for this year, excluding elprod and varmeprod
            const yearData = plantData.production[year];
            const yearTotal = Object.entries(yearData)
                .filter(([key, _]) => key !== 'elprod' && key !== 'varmeprod')
                .reduce((sum, [_, val]) => sum + (val || 0), 0);

            // Calculate the sum for this categorys
            let categoryValue = 0;
            if (Array.isArray(fuelTypes)) {
                categoryValue = fuelTypes.reduce((sum, fuelType) => 
                    sum + (yearData?.[fuelType] || 0), 0);
            } else {
                categoryValue = yearData?.[fuelTypes] || 0;
            }

            return yearTotal > 0 ? (categoryValue / yearTotal) * 100 : 0;
        });

        const hasProduction = values.some(val => val > 0);
        if (!hasProduction) return null;

        return {
            label: category,
            data: values,
            backgroundColor: graphConfig.colors[category],
            borderColor: graphConfig.colors[category],
            fill: true,
            borderWidth: 1,
            pointRadius: 0
        };
    }).filter(dataset => dataset !== null);

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: productionYears,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 0
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            onHover: (event, elements) => {
                const canvas = event.chart.canvas;
                canvas.style.cursor = elements.length ? 'pointer' : 'default';
            },
            onClick: function(event, elements) {
                if (elements.length > 0) {
                    const clickIndex = elements[0].index;
                    const year = productionYears[clickIndex];
                    createPieChart(this, plantData.production[year], year, {
                        data: plantData,
                        index: index,
                        maxValue: maxValue
                    });
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        font: {
                            size: 10
                        },
                        callback: function(value) {
                            return `${value}%`;
                        }
                    },
                    grid: {
                        color: '#E4E4E4'
                    }
                }
            },
            plugins: {
                datalabels: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(1)}%`;
                        }
                    }
                },
                legend: commonLegendConfig,
                title: {
                    display: true,
                    text: 'Production Distribution Over Time'
                }
            }
        }
    });
}

function createPieChart(originalChart, yearData, year, initialData) {
    if (!yearData) return;

    const total = Object.values(yearData).reduce((sum, val) => sum + (val || 0), 0);
    if (total === 0) return;

    const pieData = Object.entries(graphConfig.fuelTypes).map(([category, fuelTypes]) => {
        let value;
        if (Array.isArray(fuelTypes)) {
            value = fuelTypes.reduce((sum, fuel) => sum + (yearData[fuel] || 0), 0);
        } else {
            value = yearData[fuelTypes] || 0;
        }
        return {
            category,
            value,
            color: graphConfig.colors[category]
        };
    }).filter(item => item.value > 0);

    pieData.sort((a, b) => b.value - a.value);

    const canvas = document.createElement('canvas');
    canvas.id = `pieChart${initialData.index}`;
    
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Back to Timeline';
    resetBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        padding: 8px 16px;
        background-color: #fff;
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
        z-index: 10;
    `;

    const container = originalChart.canvas.parentElement;
    container.style.position = 'relative';
    
    // Store the original canvas ID before clearing
    const originalCanvasId = originalChart.canvas.id;
    
    container.innerHTML = '';
    container.appendChild(resetBtn);
    container.appendChild(canvas);

    const newChart = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: pieData.map(d => d.category),
            datasets: [{
                data: pieData.map(d => d.value),
                backgroundColor: pieData.map(d => d.color)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 0
                }
            },
            plugins: {
                datalabels: {
                    display: false
                },
                title: {
                    display: true,
                    text: `Production Distribution ${year}`
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: ${value.toFixed(0)} TJ (${percentage}%)`;
                        }
                    }
                },
                legend: commonLegendConfig
            }
        }
    });

    resetBtn.onclick = () => {
        // Recreate the original canvas with the correct ID
        container.innerHTML = `<canvas id="${originalCanvasId}"></canvas>`;
        
        // Recreate the production chart
        createProductionChart(initialData.data, initialData.index, initialData.maxValue);
    };

    return newChart;
}

function createPriceChart(plantData, index, maxValues) {
    const ctx = document.getElementById(`priceChart${index}`).getContext('2d');
    const years = ['2019', '2020', '2021', '2022', '2023', '2024'];
    
    const datasets = [
        {
            label: 'MWh Price',
            data: years.map(year => plantData.prices?.[year]?.mwh_price || null),
            borderColor: '#FF6384',
            backgroundColor: '#FF6384',
            tension: 0.1,
            fill: false,
            spanGaps: true
        },
        {
            label: 'Apartment',
            data: years.map(year => plantData.prices?.[year]?.apartment_price || null),
            borderColor: '#36A2EB',
            backgroundColor: '#36A2EB',
            tension: 0.1,
            fill: false,
            spanGaps: true
        },
        {
            label: 'House',
            data: years.map(year => plantData.prices?.[year]?.house_price || null),
            borderColor: '#4BC0C0',
            backgroundColor: '#4BC0C0',
            tension: 0.1,
            fill: false,
            spanGaps: true
        }
    ];

    const maxPrice = Math.max(
        maxValues.mwh_price,
        maxValues.apartment_price,
        maxValues.house_price
    );
    
    // Round up to nearest thousand
    const roundedMaxPrice = Math.ceil(maxPrice / 1000) * 1000;

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 0
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                datalabels: {
                    display: false
                },
                legend: commonLegendConfig,
                title: {
                    display: true,
                    text: 'Price Development'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const price = context.raw;
                            const label = context.dataset.label;
                            return price === 0 ? 
                                'No price data available' : 
                                label.includes('Price') ? 
                                    `${label}: ${price.toFixed(0)} DKK` : 
                                    `Price: ${price.toFixed(0)} DKK`;
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl'
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            modifierKey: 'ctrl'
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x'
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year'
                    },
                    grid: {
                        color: '#E4E4E4'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Price (DKK)'
                    },
                    grid: {
                        color: '#E4E4E4'
                    },
                    beginAtZero: true,
                    max: roundedMaxPrice
                }
            }
        }
    });
}

function createTotalProductionChart(plantData, index, maxValue) {
    const ctx = document.getElementById(`totalProductionChart${index}`).getContext('2d');
    
    const productionYears = Object.keys(plantData.production)
        .filter(year => !isNaN(parseInt(year)))
        .sort();

    // Create separate arrays for heat and electricity production
    const heatProduction = productionYears.map(year => 
        plantData.production[year]?.varmeprod || 0
    );
    
    const electricityProduction = productionYears.map(year => 
        plantData.production[year]?.elprod || 0
    );

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: productionYears,
            datasets: [
                {
                    label: 'Heating',
                    data: heatProduction,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    datalabels: {
                        display: context => {
                            const totalValue = heatProduction[context.dataIndex] + 
                                            electricityProduction[context.dataIndex];
                            return totalValue < (maxValue * 0.02) && context.dataIndex % 6 === 0;
                        },
                        align: 'end',
                        anchor: 'end',
                        offset: -4,
                        color: 'rgba(255, 99, 132, 1)',
                        font: {
                            size: 10
                        },
                        formatter: function(value) {
                            return value.toFixed(1) + ' TJ';
                        }
                    }
                },
                {
                    label: 'Electricity',
                    data: electricityProduction,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    datalabels: {
                        display: false  // Always hide data labels for electricity
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 0
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        },
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: false,
                        callback: function(val, index) {
                            // Show label only for every 6th year
                            return index % 6 === 0 ? this.getLabelForValue(val) : '';
                        }
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    max: maxValue,  // Use exact maxValue without rounding
                    ticks: {
                        stepSize: maxValue / 6,  // Divide range into 6 steps
                        font: {
                            size: 10
                        },
                        callback: function(value) {
                            return `${value.toFixed(1)} TJ`;
                        }
                    },
                    grid: {
                        color: '#E4E4E4'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Total Production Over Time'
                },
                legend: commonLegendConfig,
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            const index = context.dataIndex;
                            const heatValue = heatProduction[index];
                            const electricityValue = electricityProduction[index];
                            const total = heatValue + electricityValue;
                            
                            return [
                                `Heat Production: ${heatValue.toLocaleString()} TJ`,
                                `Electricity Production: ${electricityValue.toLocaleString()} TJ`,
                                `Total: ${total.toLocaleString()} TJ`
                            ];
                        }
                    }
                },
                datalabels: {
                    display: false  // Global default
                }
            }
        }
    });
}

function updateInfoBox(plantData, index) {
    const infoBox = document.querySelector(`.plant-column:nth-child(${index}) .info-box`);
    if (!infoBox) return;

    const commissionDate = new Date(plantData.idrift).getFullYear();
    
    infoBox.innerHTML = `
        <ul style="list-style: none; padding: 0;">
            <li><strong>Commissioned:</strong> ${commissionDate}</li>
            <li><strong>Power Capacity:</strong> ${plantData.elkapacitet_MW?.toFixed(1) || 'N/A'} MW</li>
            <li><strong>Heat Capacity:</strong> ${plantData.varmekapacitet_MW?.toFixed(1) || 'N/A'} MW</li>
            <li><strong>Total Area:</strong> ${plantData.total_area_km2?.toFixed(2) || 'N/A'} km²</li>
        </ul>
    `;
    
    infoBox.classList.add('visible');
} 