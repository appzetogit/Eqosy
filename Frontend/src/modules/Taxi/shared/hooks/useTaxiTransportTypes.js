import { useState, useEffect } from 'react';
import api from '../api/axiosInstance';

export const defaultTransportTypes = [
  { id: 'taxi', name: 'taxi', display_name: 'Taxi' },
  { id: 'delivery', name: 'delivery', display_name: 'Delivery' },
  { id: 'pooling', name: 'pooling', display_name: 'Pooling' },
  { id: 'outstation', name: 'outstation', display_name: 'Outstation' },
  { id: 'all', name: 'all', display_name: 'All' },
];

const ensureFullTransportTypes = (list = []) => {
  const normalized = (Array.isArray(list) ? list : []).map((item) => ({
    ...item,
    name: String(item.name || item.id || '').toLowerCase() === 'both' ? 'all' : String(item.name || item.id || '').toLowerCase(),
    display_name:
      String(item.display_name || item.name || '').toLowerCase() === 'both'
        ? 'All'
        : (item.display_name || item.name),
  }));

  const existingNames = new Set(normalized.map((item) => item.name));
  for (const def of defaultTransportTypes) {
    if (!existingNames.has(def.name)) {
      normalized.push(def);
    }
  }

  return normalized;
};

export const useTaxiTransportTypes = () => {
  const [transportTypes, setTransportTypes] = useState(defaultTransportTypes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTypes = async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/types/transport-types');
        const data = res.data || res.results || res;
        setTransportTypes(ensureFullTransportTypes(data));
      } catch (err) {
        setTransportTypes(defaultTransportTypes);
      } finally {
        setLoading(false);
      }
    };

    fetchTypes();
  }, []);

  return { transportTypes, loading, error };
};
