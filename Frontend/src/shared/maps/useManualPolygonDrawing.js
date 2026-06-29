import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatCoordinates,
  latLngPathFromPoints,
  normalizeLatLngPoint,
  parseIncomingCoordinates,
  pointsFromLatLngPath,
  sortCoordinatesRadially,
} from './polygonDrawingUtils';

const DEFAULT_POLYGON_OPTIONS = {
  strokeColor: '#4f46e5',
  strokeOpacity: 0.9,
  strokeWeight: 2,
  fillColor: '#4f46e5',
  fillOpacity: 0.2,
  clickable: true,
  editable: true,
  draggable: false,
  zIndex: 2,
};

const DEFAULT_MARKER_OPTIONS = {
  draggable: true,
  zIndex: 3,
};

const cleanupListeners = (listeners = []) => {
  listeners.forEach((listener) => {
    if (typeof listener?.remove === 'function') {
      listener.remove();
      return;
    }

    if (typeof listener === 'function') {
      listener();
    }
  });
};

export const useManualPolygonDrawing = ({
  map = null,
  enabled = true,
  attachNativeMapClickListener = true,
  coordinateFormat = 'latlng',
  minVertices = 3,
  polygonOptions = {},
  markerOptions = {},
  onCoordinatesChange,
} = {}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [coordinates, setCoordinates] = useState([]);
  const isDrawingRef = useRef(false);
  const isCompleteRef = useRef(false);

  const drawingPointsRef = useRef([]);
  const drawingMarkersRef = useRef([]);
  const previewPolygonRef = useRef(null);
  const finishedPolygonRef = useRef(null);
  const polygonListenersRef = useRef([]);
  const mapClickListenerRef = useRef(null);
  const optionsRef = useRef({
    polygonOptions: { ...DEFAULT_POLYGON_OPTIONS, ...polygonOptions },
    markerOptions: { ...DEFAULT_MARKER_OPTIONS, ...markerOptions },
  });

  useEffect(() => {
    optionsRef.current = {
      polygonOptions: { ...DEFAULT_POLYGON_OPTIONS, ...polygonOptions },
      markerOptions: { ...DEFAULT_MARKER_OPTIONS, ...markerOptions },
    };
  }, [markerOptions, polygonOptions]);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    isCompleteRef.current = isComplete;
  }, [isComplete]);

  const publishCoordinates = useCallback((points = []) => {
    const normalized = sortCoordinatesRadially(points);
    const formatted = formatCoordinates(normalized, coordinateFormat);
    setCoordinates(formatted);
    onCoordinatesChange?.(formatted);
    return formatted;
  }, [coordinateFormat, onCoordinatesChange]);

  const clearDrawingMarkers = useCallback(() => {
    drawingMarkersRef.current.forEach((marker) => marker.setMap(null));
    drawingMarkersRef.current = [];
  }, []);

  const clearPreviewPolygon = useCallback(() => {
    if (previewPolygonRef.current) {
      previewPolygonRef.current.setMap(null);
      previewPolygonRef.current = null;
    }
  }, []);

  const detachFinishedPolygon = useCallback(() => {
    cleanupListeners(polygonListenersRef.current);
    polygonListenersRef.current = [];

    if (finishedPolygonRef.current) {
      finishedPolygonRef.current.setMap(null);
      finishedPolygonRef.current = null;
    }
  }, []);

  const updatePreviewPolygonPath = useCallback((points = []) => {
    if (!map || !window.google?.maps || points.length < 2) {
      clearPreviewPolygon();
      return;
    }

    const sortedPath = latLngPathFromPoints(window.google, points);

    if (!previewPolygonRef.current) {
      previewPolygonRef.current = new window.google.maps.Polygon({
        ...optionsRef.current.polygonOptions,
        paths: sortedPath,
        editable: false,
        draggable: false,
        clickable: false,
        fillOpacity: Math.min(optionsRef.current.polygonOptions.fillOpacity || 0.2, 0.18),
        strokeOpacity: 0.75,
        zIndex: 1,
      });
      previewPolygonRef.current.setMap(map);
      return;
    }

    previewPolygonRef.current.setPath(sortedPath);
  }, [clearPreviewPolygon, map]);

  const getMarkerPositions = useCallback(() => (
    drawingMarkersRef.current
      .map((marker) => {
        const position = marker.getPosition();
        if (!position) {
          return null;
        }

        return {
          lat: position.lat(),
          lng: position.lng(),
        };
      })
      .filter(Boolean)
  ), []);

  const handleMarkerDrag = useCallback((markerIndex) => {
    const marker = drawingMarkersRef.current[markerIndex];
    if (!marker) {
      return;
    }

    const position = marker.getPosition();
    if (!position) {
      return;
    }

    drawingPointsRef.current[markerIndex] = {
      lat: position.lat(),
      lng: position.lng(),
    };

    const sortedPoints = sortCoordinatesRadially(getMarkerPositions());
    updatePreviewPolygonPath(sortedPoints);
  }, [getMarkerPositions, updatePreviewPolygonPath]);

  const handleMarkerDragEnd = useCallback((markerIndex) => {
    handleMarkerDrag(markerIndex);
    publishCoordinates(getMarkerPositions());
  }, [getMarkerPositions, handleMarkerDrag, publishCoordinates]);

  const attachFinishedPolygonListeners = useCallback((polygon) => {
    cleanupListeners(polygonListenersRef.current);
    polygonListenersRef.current = [];

    const path = polygon.getPath();

    const syncFromPath = () => {
      publishCoordinates(pointsFromLatLngPath(path));
    };

    polygonListenersRef.current = [
      path.addListener('set_at', syncFromPath),
      path.addListener('insert_at', syncFromPath),
      path.addListener('remove_at', syncFromPath),
      polygon.addListener('rightclick', (event) => {
        const vertexIndex = event.vertex;
        if (!Number.isInteger(vertexIndex) || path.getLength() <= minVertices) {
          return;
        }

        path.removeAt(vertexIndex);
        syncFromPath();
      }),
    ];
  }, [minVertices, publishCoordinates]);

  const mountFinishedPolygon = useCallback((points = []) => {
    if (!map || !window.google?.maps) {
      return;
    }

    const normalized = sortCoordinatesRadially(points);
    if (normalized.length < minVertices) {
      return;
    }

    detachFinishedPolygon();
    clearPreviewPolygon();
    clearDrawingMarkers();
    drawingPointsRef.current = [];

    const polygon = new window.google.maps.Polygon({
      ...optionsRef.current.polygonOptions,
      paths: latLngPathFromPoints(window.google, normalized),
      editable: true,
      draggable: false,
    });

    polygon.setMap(map);
    finishedPolygonRef.current = polygon;
    attachFinishedPolygonListeners(polygon);
    publishCoordinates(normalized);
    isDrawingRef.current = false;
    isCompleteRef.current = true;
    setIsDrawing(false);
    setIsComplete(true);
  }, [
    attachFinishedPolygonListeners,
    clearDrawingMarkers,
    clearPreviewPolygon,
    detachFinishedPolygon,
    map,
    minVertices,
    publishCoordinates,
  ]);

  const addDrawingMarker = useCallback((point, markerIndex) => {
    if (!map || !window.google?.maps) {
      return;
    }

    const icon = optionsRef.current.markerOptions.icon || {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: optionsRef.current.polygonOptions.fillColor || '#4f46e5',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    };

    const marker = new window.google.maps.Marker({
      ...optionsRef.current.markerOptions,
      icon,
      map,
      position: point,
      draggable: true,
    });

    marker.addListener('drag', () => handleMarkerDrag(markerIndex));
    marker.addListener('dragend', () => handleMarkerDragEnd(markerIndex));
    drawingMarkersRef.current[markerIndex] = marker;
  }, [handleMarkerDrag, handleMarkerDragEnd, map]);

  const processMapClick = useCallback((event) => {
    if (!isDrawingRef.current || isCompleteRef.current || !event?.latLng) {
      return false;
    }

    const nextPoint = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng(),
    };
    const markerIndex = drawingPointsRef.current.length;

    drawingPointsRef.current.push(nextPoint);
    addDrawingMarker(nextPoint, markerIndex);

    const sortedPoints = sortCoordinatesRadially(getMarkerPositions());
    updatePreviewPolygonPath(sortedPoints);
    publishCoordinates(sortedPoints);
    return true;
  }, [
    addDrawingMarker,
    getMarkerPositions,
    publishCoordinates,
    updatePreviewPolygonPath,
  ]);

  const handleMapClick = processMapClick;

  const startDrawing = useCallback(() => {
    if (!map) {
      return false;
    }

    detachFinishedPolygon();
    clearPreviewPolygon();
    clearDrawingMarkers();
    drawingPointsRef.current = [];
    publishCoordinates([]);
    isDrawingRef.current = true;
    isCompleteRef.current = false;
    setIsDrawing(true);
    setIsComplete(false);
    map.setOptions({
      draggableCursor: 'crosshair',
      draggingCursor: 'crosshair',
    });
    return true;
  }, [
    clearDrawingMarkers,
    clearPreviewPolygon,
    detachFinishedPolygon,
    map,
    publishCoordinates,
  ]);

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false;
    setIsDrawing(false);

    if (map) {
      map.setOptions({
        draggableCursor: null,
        draggingCursor: null,
      });
    }
  }, [map]);

  const finishDrawing = useCallback(() => {
    const points = getMarkerPositions();

    if (points.length < minVertices) {
      return false;
    }

    mountFinishedPolygon(points);
    stopDrawing();
    return true;
  }, [getMarkerPositions, minVertices, mountFinishedPolygon, stopDrawing]);

  const clearDrawing = useCallback(() => {
    stopDrawing();
    detachFinishedPolygon();
    clearPreviewPolygon();
    clearDrawingMarkers();
    drawingPointsRef.current = [];
    publishCoordinates([]);
    isCompleteRef.current = false;
    setIsComplete(false);
  }, [
    clearDrawingMarkers,
    clearPreviewPolygon,
    detachFinishedPolygon,
    publishCoordinates,
    stopDrawing,
  ]);

  const loadCoordinates = useCallback((points = []) => {
    const normalized = parseIncomingCoordinates(points);

    if (normalized.length >= minVertices) {
      mountFinishedPolygon(normalized);
      return;
    }

    clearDrawing();
  }, [clearDrawing, minVertices, mountFinishedPolygon]);

  useEffect(() => {
    if (!map || !enabled || !attachNativeMapClickListener) {
      return undefined;
    }

    mapClickListenerRef.current = map.addListener('click', handleMapClick);

    return () => {
      if (mapClickListenerRef.current) {
        mapClickListenerRef.current.remove();
        mapClickListenerRef.current = null;
      }
    };
  }, [attachNativeMapClickListener, enabled, handleMapClick, map]);

  useEffect(() => () => {
    if (mapClickListenerRef.current) {
      mapClickListenerRef.current.remove();
      mapClickListenerRef.current = null;
    }

    clearDrawingMarkers();
    clearPreviewPolygon();
    detachFinishedPolygon();

    if (map) {
      map.setOptions({
        draggableCursor: null,
        draggingCursor: null,
      });
    }
  }, [clearDrawingMarkers, clearPreviewPolygon, detachFinishedPolygon, map]);

  return {
    isDrawing,
    isComplete,
    coordinates,
    startDrawing,
    stopDrawing,
    finishDrawing,
    clearDrawing,
    loadCoordinates,
    processMapClick,
    getFinishedPolygon: () => finishedPolygonRef.current,
  };
};
