import { Gift } from '../../types';

export const mockGifts: { catalogue: Gift[] } = {
  catalogue: [
    { id: 'g-1a2b3c4d', name: 'Rose',          icon: '🌹', image: null, svgaAsset: null, coinCost: 10,     beanValue: 7,      category: 'bag',   animationType: '', soundKey: '', order: 0 },
    { id: 'g-2b3c4d5e', name: 'Heart',          icon: '❤️', image: null, svgaAsset: null, coinCost: 50,     beanValue: 35,     category: 'bag',   animationType: '', soundKey: '', order: 1 },
    { id: 'g-3c4d5e6f', name: 'Lollipop',       icon: '🍭', image: null, svgaAsset: null, coinCost: 99,     beanValue: 69,     category: 'bag',   animationType: '', soundKey: '', order: 2 },
    { id: 'g-4d5e6f7a', name: 'Ice Cream',      icon: '🍦', image: null, svgaAsset: null, coinCost: 199,    beanValue: 139,    category: 'bag',   animationType: '', soundKey: '', order: 3 },
    { id: 'g-5e6f7a8b', name: 'Teddy Bear',     icon: '🧸', image: null, svgaAsset: null, coinCost: 299,    beanValue: 209,    category: 'bag',   animationType: '', soundKey: '', order: 4 },
    { id: 'g-6f7a8b9c', name: 'Fireworks',      icon: '🎆', image: null, svgaAsset: null, coinCost: 500,    beanValue: 350,    category: 'hot', animationType: '', soundKey: 'fanfare', order: 5 },
    { id: 'g-7a8b9c0d', name: 'Crown',          icon: '👑', image: null, svgaAsset: null, coinCost: 1_000,  beanValue: 700,    category: 'hot', animationType: '', soundKey: 'sparkle', order: 6 },
    { id: 'g-8b9c0d1e', name: 'Diamond',        icon: '💎', image: null, svgaAsset: null, coinCost: 2_000,  beanValue: 1_400,  category: 'hot', animationType: '', soundKey: 'sparkle', order: 7 },
    { id: 'g-9c0d1e2f', name: 'Rocket',         icon: '🚀', image: null, svgaAsset: null, coinCost: 5_000,  beanValue: 3_500,  category: 'hot', animationType: '', soundKey: 'boom', order: 8 },
    { id: 'g-0d1e2f3a', name: 'Love Ride',      icon: '💕', image: 'gifts/86.png',  svgaAsset: 'gifts/86.svga',  coinCost: 9_999,  beanValue: 6_999,  category: 'lucky', animationType: 'hearts_shower', soundKey: 'fanfare', order: 9 },
    { id: 'g-1e2f3a4b', name: 'Golden Palace',  icon: '🕌', image: 'gifts/93.png',  svgaAsset: 'gifts/93.svga',  coinCost: 15_000, beanValue: 10_500, category: 'lucky', animationType: 'palace',        soundKey: 'fanfare', order: 10 },
    { id: 'g-2f3a4b5c', name: 'Moonlight',      icon: '🌙', image: 'gifts/116.png', svgaAsset: 'gifts/116.svga', coinCost: 25_000, beanValue: 17_500, category: 'lucky', animationType: 'moon_glow',     soundKey: 'sparkle', order: 11 },
    { id: 'g-3a4b5c6d', name: 'Magic Lamp',     icon: '🧞', image: 'gifts/121.png', svgaAsset: 'gifts/121.svga', coinCost: 50_000, beanValue: 35_000, category: 'lucky', animationType: 'magic_lamp',    soundKey: 'boom',    order: 12 },
  ],
};
