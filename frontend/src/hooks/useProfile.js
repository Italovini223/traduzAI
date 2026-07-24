import { useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';

export function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/profile');
      setProfile(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setProfile(null);
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const createProfile = useCallback(async (data) => {
    const res = await api.post('/api/profile', data);
    setProfile(res.data);
    return res.data;
  }, []);

  const updateProfile = useCallback(async (data) => {
    const res = await api.put('/api/profile', data);
    setProfile(res.data);
    return res.data;
  }, []);

  const hasProfile = profile !== null && profile !== undefined;

  return { profile, loading, error, hasProfile, createProfile, updateProfile, refetch: fetchProfile };
}
