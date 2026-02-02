import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

// For WebSocket, we need the base URL without /api/v1 path
const getSocketUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (!apiUrl) return ''; // Same origin in development
  // Remove /api/v1 suffix if present
  return apiUrl.replace(/\/api\/v1$/, '');
};

const SOCKET_URL = getSocketUrl();

interface ArbitrageUpdate {
  id: string;
  matchId: string;
  roi: number;
  netProfit: number;
  confidence: number;
  sourceMarket: {
    platform: string;
    question: string;
  };
  targetMarket: {
    platform: string;
    question: string;
  };
}

interface PriceUpdate {
  platform: string;
  marketId: string;
  price: number;
  timestamp: string;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Connect to WebSocket server
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to real-time updates');
      // Subscribe to arbitrage updates
      socket.emit('subscribe:arbitrage');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from real-time updates');
    });

    // Handle new arbitrage opportunities
    socket.on('newOpportunity', (data: ArbitrageUpdate) => {
      console.log('New arbitrage opportunity:', data);
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
    });

    // Handle price updates
    socket.on('price', (data: PriceUpdate) => {
      // Invalidate specific market queries
      queryClient.invalidateQueries({ queryKey: ['markets', data.marketId] });
    });

    // Handle orderbook updates
    socket.on('orderbook', () => {
      // Could update specific orderbook data here
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const subscribeToMarket = useCallback((marketId: string) => {
    socketRef.current?.emit('subscribe:market', marketId);
  }, []);

  const unsubscribeFromMarket = useCallback((marketId: string) => {
    socketRef.current?.emit('unsubscribe:market', marketId);
  }, []);

  return {
    subscribeToMarket,
    unsubscribeFromMarket,
    isConnected: socketRef.current?.connected ?? false,
  };
}
