import { formatFuelType } from './eventListeners.js';

export function createMunicipalityTooltip(map) {
    const tooltip = document.createElement('div');
    tooltip.className = 'mapboxgl-popup mapboxgl-popup-anchor-top';
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.visibility = 'hidden';
    document.body.appendChild(tooltip);

    let hoveredMunicipalityId = null;

    map.on('mousemove', 'municipalities-fill', (e) => {
        if (e.features.length > 0) {
            const feature = e.features[0];
            const municipalityId = feature.properties.lau_1;

            if (hoveredMunicipalityId !== municipalityId) {
                const centroidSource = map.getSource('municipality-centroids');
                const centroidData = centroidSource._data;
                const centroidFeature = centroidData.features.find(f => 
                    f.properties.lau_1 === municipalityId
                );

                tooltip.innerHTML = `
                    <div class="mapboxgl-popup-content tooltip-content">
                        <h3 class="tooltip-title">${feature.properties.name}</h3>
                        <div class="tooltip-body">
                            <div class="tooltip-row">
                                <span class="tooltip-label">Main fuel:</span>
                                <span class="tooltip-value">${formatFuelType(centroidFeature?.properties?.currentMainFuel, feature.properties)}</span>
                            </div>
                            <div class="tooltip-row">
                                <span class="tooltip-label">Population:</span>
                                <span class="tooltip-value">${feature.properties.population?.toLocaleString('da-DK') || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="tooltip-footer">
                            <em>Click to select, Ctrl+Click to deselect</em>
                        </div>
                    </div>`;
                hoveredMunicipalityId = municipalityId;
            }

            tooltip.style.visibility = 'visible';
            tooltip.style.left = `${e.point.x + 5}px`;
            tooltip.style.top = `${e.point.y + 5}px`;
        }
    });

    map.on('mouseleave', 'municipalities-fill', () => {
        hoveredMunicipalityId = null;
        tooltip.style.visibility = 'hidden';
    });
} 