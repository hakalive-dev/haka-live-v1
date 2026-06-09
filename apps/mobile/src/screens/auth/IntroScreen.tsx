import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markIntroCompleted } from '../../utils/introStorage';
import { prefetchLoginScreen } from '../../utils/authPreflight';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Intro'>;

const { width, height } = Dimensions.get('window');

// Scale factors from Figma artboard (430×932)
const sX = width / 430;
const sY = height / 932;

const PINK = '#DB1359';

// Ellipse clip container — Figma: width 890, height 715, left -132, top -121
// Off-center to the LEFT shifts the ellipse right of screen center,
// making the bottom-left edge cut higher → the asymmetric left curve.
const EL_W = 890 * sX;
const EL_H = 715 * sY;
const EL_LEFT = -132 * sX;
const EL_TOP = -121 * sY;

// Image inside the ellipse — Figma: 431×600 at screen position (0, -1)
// Relative to the ellipse container: left = 0 - (-132) = 132, top = -1 - (-121) = 120
const IMG_W = 431 * sX;
const IMG_H = 600 * sY;
const IMG_X = 132 * sX;
const IMG_Y = 120 * sY;

const SLIDES = [
  {
    id: '1',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    image: require('../../assets/intro1.png'),
    title: 'Meet, Chat & Connect',
    subtitle:
      'Find genuine connections in real time. Stream, share, and build moments that matter.',
  },
  {
    id: '2',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    image: require('../../assets/intro2.png'),
    title: 'Go Live, Feel Alive',
    subtitle:
      'Share your energy, your stories, and your charm—connect instantly with people who get you.',
  },
  {
    id: '3',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    image: require('../../assets/intro3.png'),
    title: 'Intimacy Without Distance',
    subtitle:
      'Break the barriers. Enjoy meaningful chats and live moments with people from anywhere.',
  },
];

export function IntroScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const index = viewableItems[0].index ?? 0;
        setCurrentIndex(index);
        if (index === SLIDES.length - 1) {
          prefetchLoginScreen();
        }
      }
    },
  ).current;

  useEffect(() => {
    prefetchLoginScreen();
  }, []);

  const goToLogin = () => {
    void markIntroCompleted();
    navigation.replace('Login');
  };

  const renderSlide = ({ item }: { item: (typeof SLIDES)[0] }) => (
    <View style={styles.slide}>
      {/* Ellipse-clipped image — overflow:hidden on the container clips to the rounded shape */}
      <View style={styles.ellipseClip}>
        <Image
          source={item.image}
          style={styles.slideImage}
          resizeMode="cover"
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={styles.overlay}
        pointerEvents="box-none"
      >
        {/* Text — fixed overlay, tracks currentIndex */}
        <View style={styles.textBlock} pointerEvents="none">
          <Text style={styles.title}>{SLIDES[currentIndex].title}</Text>
          <Text style={styles.subtitle}>{SLIDES[currentIndex].subtitle}</Text>
        </View>

        {/* Dots */}
        <View style={[styles.dots, { bottom: 67 * sY + insets.bottom }]} pointerEvents="none">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        {/* Get Started — only on last slide */}
        {currentIndex === SLIDES.length - 1 && (
          <Pressable style={[styles.button, { bottom: 40 + insets.bottom }]} onPress={goToLogin}>
            <Text style={styles.buttonText}>Get Started</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PINK,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  slide: {
    width,
    height,
    backgroundColor: PINK,
  },
  ellipseClip: {
    position: 'absolute',
    width: EL_W,
    height: EL_H,
    left: EL_LEFT,
    top: EL_TOP,
    // borderRadius >= half-height turns the rectangle into an ellipse-like shape.
    // The ellipse is left-shifted (center at ~73% of screen width), making the
    // bottom-left edge sit higher than the bottom-right — the asymmetric curve.
    borderRadius: EL_H / 2,
    overflow: 'hidden',
  },
  slideImage: {
    position: 'absolute',
    width: IMG_W,
    height: IMG_H,
    left: IMG_X,
    top: IMG_Y,
  },
  textBlock: {
    position: 'absolute',
    left: 39 * sX,
    right: 39 * sX,
    top: 666 * sY,
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.33,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '300',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: -0.33,
  },
  dots: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 10,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 15 * sX,
    height: 15 * sX,
    borderRadius: (15 * sX) / 2,
    backgroundColor: 'rgba(223,223,223,0.2)',
  },
  dotActive: {
    backgroundColor: '#DFDFDF',
  },
  button: {
    position: 'absolute',
    left: 32,
    right: 32,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: PINK,
    fontWeight: '700',
    fontSize: 15,
  },
});
