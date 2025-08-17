import React, { useState } from 'react';
import './SpeedChart.css';

const SpeedChart = ({ data, sessionStats }) => {
  // Configuration for fixed-size bars and 30-minute window
  const BAR_WIDTH_PX = 5; // Fixed 5px per data point
  const MINUTES_TO_SHOW = 30; // Show last 30 minutes
  const CHART_HEIGHT = 120; // Fixed chart height in pixels

  // Tooltip state
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, data: null });

  if (!data || data.length < 2) {
    return (
      <div className="speed-chart-placeholder">
        <div className="chart-internal-header">
          <span className="chart-internal-title">Speed History</span>
          <span className="chart-internal-subtitle">Last 30 minutes</span>
        </div>
        <div className="chart-no-data">No speed data yet</div>
      </div>
    );
  }

  // Filter data to show only the last 30 minutes
  // Assuming data points are collected every second, 30 minutes = 1800 data points
  const maxDataPoints = MINUTES_TO_SHOW * 60; // 30 minutes * 60 seconds
  const recentData = data.slice(-maxDataPoints);

  // Calculate chart width based on number of data points and fixed bar width
  const chartWidthPx = recentData.length * BAR_WIDTH_PX;
  const minChartWidth = 300; // Minimum width to ensure readability
  const finalChartWidth = Math.max(chartWidthPx, minChartWidth);

  // Handle speed spikes by using a more intelligent scaling approach
  const speeds = recentData.map(d => d.speed);

  // Calculate percentiles to handle outliers/spikes
  const sortedSpeeds = [...speeds].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedSpeeds.length * 0.95);
  const p99Index = Math.floor(sortedSpeeds.length * 0.99);
  const p95Speed = sortedSpeeds[p95Index] || 0;
  const p99Speed = sortedSpeeds[p99Index] || 0;
  const maxSpeedFromData = Math.max(...speeds);

  // Use session stats peak speed if available, but cap it intelligently
  const maxSpeedFromStats = sessionStats?.peakSpeed ? sessionStats.peakSpeed / (1024 * 1024) : null;

  // Choose scaling strategy based on data distribution
  let maxSpeed;
  if (maxSpeedFromStats && maxSpeedFromData > 0) {
    // If there's a huge spike (more than 3x the 95th percentile), use 99th percentile + 20% buffer
    const spikeThreshold = p95Speed * 3;
    if (maxSpeedFromData > spikeThreshold && p99Speed > 0) {
      maxSpeed = p99Speed * 1.2; // Use 99th percentile with 20% buffer
      console.log(`📊 Speed spike detected (${maxSpeedFromData.toFixed(1)} MB/s), using capped scale: ${maxSpeed.toFixed(1)} MB/s`);
    } else {
      // Use session stats peak speed but cap it to reasonable bounds
      maxSpeed = Math.min(maxSpeedFromStats, maxSpeedFromData * 1.5);
    }
  } else {
    // Fallback to data-driven scaling with spike protection
    if (maxSpeedFromData > p95Speed * 3 && p95Speed > 0) {
      maxSpeed = p95Speed * 1.5; // Use 95th percentile with 50% buffer
    } else {
      maxSpeed = maxSpeedFromData * 1.1; // Use max with 10% buffer
    }
  }

  // Ensure minimum scale for readability
  maxSpeed = Math.max(maxSpeed, 1); // At least 1 MB/s scale

  // Always start from 0 for better visualization
  const minSpeed = 0;
  const speedRange = maxSpeed - minSpeed || 1;

  // Format speed for display
  const formatSpeed = (speedMBps) => {
    if (speedMBps >= 1) {
      return `${speedMBps.toFixed(1)} MB/s`;
    } else {
      return `${(speedMBps * 1024).toFixed(0)} KB/s`;
    }
  };

  // Format timestamp for tooltip
  const formatTimestamp = (dataIndex) => {
    // Assuming data points are collected every second, calculate approximate timestamp
    const now = new Date();
    const secondsAgo = recentData.length - 1 - dataIndex;
    const timestamp = new Date(now.getTime() - secondsAgo * 1000);
    return timestamp.toLocaleTimeString();
  };

  // Handle mouse events for tooltips
  const handleMouseEnter = (event, dataPoint, index) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const containerRect = event.currentTarget.closest('.chart-scroll-container').getBoundingClientRect();

    setTooltip({
      visible: true,
      x: rect.left - containerRect.left + (BAR_WIDTH_PX / 2),
      y: rect.top - containerRect.top - 10,
      data: {
        speed: dataPoint.speed,
        cappedSpeed: dataPoint.cappedSpeed || dataPoint.speed,
        isSpike: dataPoint.isSpike,
        timestamp: formatTimestamp(index),
        index: index
      }
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, data: null });
  };

  // Create bar chart data points with fixed positioning and spike handling
  const bars = recentData.map((point, index) => {
    const x = index * BAR_WIDTH_PX;
    // Cap the height calculation to prevent bars from going off-chart
    const cappedSpeed = Math.min(point.speed, maxSpeed);
    const height = ((cappedSpeed - minSpeed) / speedRange) * CHART_HEIGHT;
    const isSpike = point.speed > maxSpeed;
    return { x, height, speed: point.speed, cappedSpeed, isSpike, index };
  });

  // Create line chart path with fixed positioning and spike handling
  const linePoints = recentData.map((point, index) => {
    const x = index * BAR_WIDTH_PX + (BAR_WIDTH_PX / 2); // Center line on bars
    // Cap the line position to prevent it from going off-chart
    const cappedSpeed = Math.min(point.speed, maxSpeed);
    const y = CHART_HEIGHT - ((cappedSpeed - minSpeed) / speedRange) * CHART_HEIGHT;
    const isSpike = point.speed > maxSpeed;
    return { x, y, speed: point.speed, cappedSpeed, isSpike };
  });

  // Create SVG path string for the line
  const linePath = linePoints.map((point, index) => {
    const command = index === 0 ? 'M' : 'L';
    return `${command} ${point.x} ${point.y}`;
  }).join(' ');

  // Create area fill path (from line to bottom)
  const areaPath = `${linePath} L ${linePoints[linePoints.length - 1].x} ${CHART_HEIGHT} L ${linePoints[0].x} ${CHART_HEIGHT} Z`;

  // Check if there are any spikes being capped
  const hasSpikes = bars.some(bar => bar.isSpike);
  const spikeCount = bars.filter(bar => bar.isSpike).length;

  return (
    <div className="enhanced-speed-chart">
      {/* Speed labels */}
      <div className="speed-labels">
        <div className="speed-label-max">{formatSpeed(maxSpeed)}</div>
        <div className="speed-label-mid">{formatSpeed(maxSpeed / 2)}</div>
        <div className="speed-label-min">{formatSpeed(minSpeed)}</div>
      </div>

      {/* Scrollable container for the chart */}
      <div className="chart-scroll-container">
        <svg
          width="100%"
          height="100%"
          className="enhanced-speed-chart-svg"
          viewBox={`0 0 ${finalChartWidth} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="enhanced-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e1e5e9" strokeWidth="0.3" opacity="0.6"/>
            </pattern>

            {/* Gradients for bars and area */}
            <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E3F2FD" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#BBDEFB" stopOpacity="0.9"/>
            </linearGradient>

            {/* Gradient for spike bars */}
            <linearGradient id="spikeBarGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FF9800" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#F57C00" stopOpacity="0.9"/>
            </linearGradient>

            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2E7D32" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#2E7D32" stopOpacity="0.05"/>
            </linearGradient>
          </defs>

          {/* Grid background */}
          <rect width={finalChartWidth} height={CHART_HEIGHT} fill="url(#enhanced-grid)" />

          {/* Horizontal reference lines */}
          <line x1="0" y1={CHART_HEIGHT * 0.25} x2={finalChartWidth} y2={CHART_HEIGHT * 0.25} stroke="#e1e5e9" strokeWidth="0.5" opacity="0.8"/>
          <line x1="0" y1={CHART_HEIGHT * 0.5} x2={finalChartWidth} y2={CHART_HEIGHT * 0.5} stroke="#e1e5e9" strokeWidth="0.5" opacity="0.8"/>
          <line x1="0" y1={CHART_HEIGHT * 0.75} x2={finalChartWidth} y2={CHART_HEIGHT * 0.75} stroke="#e1e5e9" strokeWidth="0.5" opacity="0.8"/>

          {/* Bar chart layer (blue) */}
          {bars.map((bar, index) => (
            <g key={`bar-group-${index}`}>
              {/* Invisible hover area for better tooltip interaction */}
              <rect
                x={bar.x}
                y={0}
                width={BAR_WIDTH_PX}
                height={CHART_HEIGHT}
                fill="transparent"
                className="tooltip-trigger"
                onMouseEnter={(e) => handleMouseEnter(e, bar, index)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'pointer' }}
              />
              <rect
                x={bar.x}
                y={CHART_HEIGHT - bar.height}
                width={BAR_WIDTH_PX * 0.8} // Slightly narrower bars for better appearance
                height={bar.height}
                fill={bar.isSpike ? "url(#spikeBarGradient)" : "url(#barGradient)"}
                className="speed-bar"
                style={{
                  pointerEvents: 'none' // Let the invisible rect handle mouse events
                }}
              />
              {/* Spike indicator - small triangle at top of bar */}
              {bar.isSpike && (
                <polygon
                  points={`${bar.x + (BAR_WIDTH_PX * 0.4)},${CHART_HEIGHT - bar.height - 3} ${bar.x + (BAR_WIDTH_PX * 0.2)},${CHART_HEIGHT - bar.height + 2} ${bar.x + (BAR_WIDTH_PX * 0.6)},${CHART_HEIGHT - bar.height + 2}`}
                  fill="#FF5722"
                  className="spike-indicator"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          ))}

          {/* Area fill under line (light green) */}
          <path
            d={areaPath}
            fill="url(#areaGradient)"
            className="speed-area"
          />

          {/* Line chart layer (dark green) */}
          <path
            d={linePath}
            fill="none"
            stroke="#2E7D32"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="speed-line"
          />

          {/* Data points removed for cleaner appearance */}

          {/* Current speed indicator (larger dot) */}
          {linePoints.length > 0 && (
            <circle
              cx={linePoints[linePoints.length - 1].x}
              cy={linePoints[linePoints.length - 1].y}
              r="4"
              fill="#1B5E20"
              stroke="#2E7D32"
              strokeWidth="2"
              className="current-speed-indicator"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => handleMouseEnter(e, {
                speed: linePoints[linePoints.length - 1].speed,
                cappedSpeed: linePoints[linePoints.length - 1].cappedSpeed || linePoints[linePoints.length - 1].speed,
                isSpike: linePoints[linePoints.length - 1].isSpike
              }, linePoints.length - 1)}
              onMouseLeave={handleMouseLeave}
            />
          )}
        </svg>
      </div>

      {/* Current speed overlay */}
      <div className="current-speed-overlay">
        <span className="current-speed-value">
          {formatSpeed(recentData[recentData.length - 1]?.speed || 0)}
        </span>
      </div>

      {/* Tooltip */}
      {tooltip.visible && tooltip.data && (
        <div
          className="speed-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="tooltip-header">
            <span className="tooltip-time">{tooltip.data.timestamp}</span>
            {tooltip.data.isSpike && (
              <span className="tooltip-spike-badge">⚡ SPIKE</span>
            )}
          </div>
          <div className="tooltip-content">
            <div className="tooltip-speed">
              <span className="tooltip-label">Speed:</span>
              <span className="tooltip-value">{formatSpeed(tooltip.data.speed)}</span>
            </div>
            {tooltip.data.isSpike && (
              <div className="tooltip-capped">
                <span className="tooltip-label">Displayed:</span>
                <span className="tooltip-value">{formatSpeed(tooltip.data.cappedSpeed)}</span>
              </div>
            )}
            <div className="tooltip-index">
              <span className="tooltip-label">Data point:</span>
              <span className="tooltip-value">#{tooltip.data.index + 1}</span>
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="tooltip-arrow"></div>
        </div>
      )}
    </div>
  );
};

export default SpeedChart;
