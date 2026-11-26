import { create } from 'zustand';

type MapState = {
  picking: boolean;
  setPicking: (value: boolean) => void;
};

// 選択ID・適用済み検索条件は共有URLから読む。Zustandは一時的な地図操作に使う。
export const useMapStore = create<MapState>((set) => ({
  picking: false,
  setPicking: (picking) => set({ picking }),
}));
