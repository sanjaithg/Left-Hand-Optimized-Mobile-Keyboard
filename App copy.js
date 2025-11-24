import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { View, Dimensions, StyleSheet, Text, TouchableOpacity, Platform, PanResponder } from 'react-native';
import * as Svg from 'react-native-svg';

const { Path, G, Text: SvgText } = Svg;
const { width, height } = Dimensions.get('window');

// --- COLOR PALETTE (Simplified) ---
const COLORS = {
    BACKGROUND: '#f0f0f0',
    KEY_PRIMARY: '#333333',
    KEY_SPECIAL: '#666666',
    WHITE: '#fff',
    TEXT_INPUT_BG: '#ffffff',
    RED: '#ff4444',
    SWIPE_TRACE: '#4CAF50', // Color for swipe tracing
};

// --- KEY DATA STRUCTURE (Defines all keys and rows) ---
const KEY_ROWS = [
    // Outermost Row (QWERTYUIOP) - 10 keys
    { chars: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], type: 'alpha', angleOffset: 38 },
    // Middle Row (ASDFGHJKL) - 9 keys
    { chars: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], type: 'alpha', angleOffset: 38.75 },
    // Inner Row (ZXCVBNM) - 7 keys
    { chars: ['Z', 'X', 'C', 'V', 'B', 'N', 'M'], type: 'alpha', angleOffset: 40 },
];

// --- CENTRALIZED KEYBOARD CONFIGURATION (EDIT HERE) ---
const KEYBOARD_CONFIG = {
    // --- Global Sizing & Position ---
    RADIUS_BASE: width * 1.25,
    ARC_CENTER_X_OFFSET: width * -0.2,
    ARC_CENTER_Y_ADJUSTMENT: 40,
    BOTTOM_INSET_PIXELS: Platform.OS === 'ios' ? 34 : 20,

    // --- Geometry & Spacing ---
    KEY_WIDTH_ANGLE: 5.5,
    KEY_PADDING_ANGLE: 0.2,
    RADIUS_STEP: 55,
    START_ANGLE: 160,

    // --- Swipe Configuration ---
    SWIPE_MIN_DISTANCE: 10, // Minimum distance for a move to be considered a swipe
};
// ------------------------------------------

// --- CALCULATED VALUES (DO NOT EDIT) ---
const RADIUS_BASE = KEYBOARD_CONFIG.RADIUS_BASE;
const KEYBOARD_HEIGHT = height;

const CENTER_X = KEYBOARD_CONFIG.ARC_CENTER_X_OFFSET;
const CENTER_Y = KEYBOARD_HEIGHT - KEYBOARD_CONFIG.BOTTOM_INSET_PIXELS + KEYBOARD_CONFIG.ARC_CENTER_Y_ADJUSTMENT;

const { KEY_WIDTH_ANGLE, KEY_PADDING_ANGLE, START_ANGLE } = KEYBOARD_CONFIG;


// --- HELPER FUNCTION: Convert polar coordinates to Cartesian ---
const polarToCartesian = (center_x, center_y, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: center_x + (radius * Math.cos(angleInRadians)),
        y: center_y + (radius * Math.sin(angleInRadians))
    };
};

// --- HELPER FUNCTION: Check if a point is within a key arc ---
const isPointInArc = (pointX, pointY, keyData) => {
    // 1. Check Radial Distance
    const dx = pointX - CENTER_X;
    const dy = pointY - CENTER_Y;
    const radialDistance = Math.sqrt(dx * dx + dy * dy);

    if (radialDistance < keyData.innerRadius || radialDistance > keyData.outerRadius) {
        return false;
    }

    // 2. Check Angular Position
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    angle = (angle + 360 + 90) % 360; 

    // Simple range check against the key's pre-calculated angles
    const isAngleInRange = keyData.keyStartAngle <= angle && angle <= keyData.keyEndAngle;

    return isAngleInRange;
};

// --- COMPONENT: SVG Arc Visual Renderer (Draws the shape) ---
const ArcVisual = memo(({ keyData, isSwiped }) => {
    const { isSpecial, innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle, keyChar } = keyData;

    // 1. Calculate the geometry coordinates
    const innerStart = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyStartAngle);
    const innerEnd = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyEndAngle);
    const outerStart = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyStartAngle);
    const outerEnd = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyEndAngle);

    // 2. Define the SVG Path
    const arcPath = `
        M ${innerStart.x} ${innerStart.y}
        L ${outerStart.x} ${outerStart.y}
        A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}
        L ${innerEnd.x} ${innerEnd.y}
        A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}
        Z
    `;

    // 3. Calculate the text position and rotation
    const textRadius = (innerRadius + outerRadius) / 2;
    const textPosition = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    const rotation = keyCenterAngle - 90;

    return (
        <G>
            <Path
                d={arcPath}
                fill={isSwiped ? COLORS.SWIPE_TRACE : (isSpecial ? COLORS.KEY_SPECIAL : COLORS.KEY_PRIMARY)}
                stroke={COLORS.WHITE}
                strokeWidth="1.5"
            />
            <SvgText
                x={textPosition.x}
                y={textPosition.y}
                fontSize="14"
                fontWeight="bold"
                fill={COLORS.WHITE}
                textAnchor="middle"
                alignmentBaseline="middle"
                transform={`rotate(${rotation} ${textPosition.x} ${textPosition.y})`}
            >
                {keyChar}
            </SvgText>
        </G>
    );
});


// --- MAIN APP COMPONENT ---
export default function App() {
    const [typedText, setTypedText] = useState('');
    const [swipedKeys, setSwipedKeys] = useState([]);
    const [swipePath, setSwipePath] = useState('');

    const textRef = useRef(''); // Holds the current text for quick updates
    
    // Ref for the last key char recorded during a swipe to prevent duplicates
    const lastSwipedCharRef = useRef(null);

    // FIX 1: Simplified text update for immediate rendering, removing InteractionManager
    const handleTextUpdate = (newText) => {
        textRef.current = newText;
        setTypedText(newText);
    };

    const handleKeyPress = useCallback((char) => {
        let newText = textRef.current;

        // Handle special keys first
        if (char === 'SPACE') {
            newText += ' ';
        } else if (char === 'DELETE') {
            newText = newText.slice(0, -1);
        } else if (char === 'RETURN') {
            newText += '\n';
        } else if (char === 'SHIFT' || char === '123' || char === ':-)') {
            // Mode keys: no text output
        } else {
            // Handle character keys (tapped or swiped word)
            newText += char.toLowerCase();
        }

        handleTextUpdate(newText);
    }, [handleTextUpdate]);


    // --- OPTIMIZATION: PRE-CALCULATE ALL KEY GEOMETRY (Runs once) ---
    const allKeys = useMemo(() => {
        let keys = [];
        let currentKeyIndex = 0;
        const radialStep = KEYBOARD_CONFIG.RADIUS_STEP;

        const calculateKeyGeometry = (char, index, innerRadius, outerRadius, angleMultiplier = 1, isSpecial = false) => {
            const angleSize = KEY_WIDTH_ANGLE * angleMultiplier;
            const keyStartAngle = START_ANGLE + (index * (KEY_WIDTH_ANGLE + KEY_PADDING_ANGLE));
            const keyEndAngle = keyStartAngle + angleSize;
            const keyCenterAngle = keyStartAngle + (angleSize / 2);

            return {
                keyChar: char,
                isSpecial,
                innerRadius,
                outerRadius,
                keyCenterAngle,
                keyStartAngle,
                keyEndAngle,
                angleMultiplier
            };
        };

        // Calculate Radii and Angular Positions for the 3 main rows
        KEY_ROWS.forEach((row, rowIndex) => {
            const outerRadius = RADIUS_BASE - (rowIndex * radialStep);
            const innerRadius = outerRadius - radialStep;

            currentKeyIndex = row.angleOffset;

            row.chars.forEach(char => {
                keys.push(calculateKeyGeometry(char, currentKeyIndex, innerRadius, outerRadius, 1, false));
                currentKeyIndex++;
            });
        });

        // Add Special Keys
        const radialSteps = KEY_ROWS.length;
        const outmostRadius = RADIUS_BASE;
        const innerMostRadius = RADIUS_BASE - (radialSteps * radialStep);

        // Keys on the outermost ring (outside QWERTY)
        keys.push(calculateKeyGeometry('DELETE', 10, outmostRadius, outmostRadius + radialStep, 1.5, true));
        keys.push(calculateKeyGeometry('SHIFT', 26, outmostRadius, outmostRadius + radialStep, 1.5, true));
        keys.push(calculateKeyGeometry('SPACE', 35, outmostRadius, outmostRadius + radialStep, 3, true));

        // Keys on the innermost ring (outside ZXCVBNM)
        keys.push(calculateKeyGeometry('123', 39, innerMostRadius, innerMostRadius + radialStep, 1.5, true));
        keys.push(calculateKeyGeometry('RETURN', 17, innerMostRadius, innerMostRadius + radialStep, 2, true));

        return keys;
    }, [width, height]);


    // --- PAN RESPONDER FOR SWIPE TYPING ---
    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (evt) => {
            setSwipedKeys([]);
            setSwipePath(`M${evt.nativeEvent.pageX} ${evt.nativeEvent.pageY}`);
            lastSwipedCharRef.current = null;
        },

        onPanResponderMove: (evt) => {
            const { pageX, pageY } = evt.nativeEvent;

            // 1. Update the visual swipe path
            setSwipePath(path => path + ` L${pageX} ${pageY}`);

            // 2. Check for key intersection
            for (const keyData of allKeys) {
                if (keyData.isSpecial) continue; 

                if (isPointInArc(pageX, pageY, keyData)) {
                    const char = keyData.keyChar;
                    
                    if (char !== lastSwipedCharRef.current) {
                        setSwipedKeys(current => {
                            const newSwipedKeys = [...current, char];
                            lastSwipedCharRef.current = char;
                            return newSwipedKeys;
                        });
                        break; 
                    }
                }
            }
        },

        onPanResponderRelease: (evt, gestureState) => {
            const { dx, dy } = gestureState;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Clear visual trace and reset swipe refs
            setSwipePath('');
            lastSwipedCharRef.current = null;

            if (distance < KEYBOARD_CONFIG.SWIPE_MIN_DISTANCE) {
                // Detected as a TAP
                const { pageX, pageY } = evt.nativeEvent;
                let tappedKey = null;

                // Find the key that was tapped
                for (const keyData of allKeys) {
                    if (isPointInArc(pageX, pageY, keyData)) {
                        tappedKey = keyData.keyChar;
                        break;
                    }
                }
                if (tappedKey) {
                    handleKeyPress(tappedKey);
                }
            } else {
                // Detected as a SWIPE
                const swipedWord = swipedKeys.join('');
                if (swipedWord.length > 0) {
                    handleKeyPress(swipedWord);
                    handleKeyPress('SPACE'); // Add a space after a swiped word
                }
            }
            setSwipedKeys([]); // Reset swiped keys
        },
    }), [allKeys, swipedKeys, handleKeyPress]);

    return (
        <View style={styles.container}>

            {/* Simple Text Box */}
            <View style={styles.inputContainer}>
                {/* FIX 2: Removed key={displayTrigger} for stable rendering */}
                <Text style={styles.typedText}>{typedText || 'Start swiping or tapping...'}</Text>
                
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleKeyPress('DELETE')}>
                    <Text style={styles.deleteButtonText}>DEL</Text>
                </TouchableOpacity>
            </View>

            {/* 1. SVG RENDERING LAYER (VISUALS ONLY) */}
            <View style={styles.keyboardContainer}>
                <Svg.Svg height={KEYBOARD_HEIGHT} width={width} style={styles.svgOverlay}>
                    <G>
                        {allKeys.map((keyData) => (
                            <ArcVisual
                                key={keyData.keyChar + keyData.keyCenterAngle}
                                keyData={keyData}
                                isSwiped={swipedKeys.includes(keyData.keyChar)} // Highlight swiped keys
                            />
                        ))}
                        {/* SWIPE TRACE PATH */}
                        <Path
                            d={swipePath}
                            fill="none"
                            stroke={COLORS.SWIPE_TRACE}
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeOpacity="0.8"
                        />
                    </G>
                </Svg.Svg>

                {/* 2. TOUCH LAYER (Single PanResponder View) */}
                <View
                    style={styles.touchOverlay}
                    {...panResponder.panHandlers}
                />
            </View>
        </View>
    );
}

// --- STYLESHEET ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? 25 : 45,
    },
    // Simple Input Area
    inputContainer: {
        backgroundColor: COLORS.TEXT_INPUT_BG,
        borderBottomWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 15,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 50,
    },
    typedText: {
        fontSize: 20,
        color: '#000',
        flex: 1,
        minHeight: 30,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 5,
        padding: 5,
    },
    deleteButton: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: COLORS.RED,
        borderRadius: 5,
        marginLeft: 10,
    },
    deleteButtonText: {
        color: COLORS.WHITE,
        fontWeight: 'bold',
    },
    // Keyboard Base Container
    keyboardContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: width,
        height: height,
        zIndex: 1,
    },
    svgOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        zIndex: 5,
    },
    touchOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: width,
        height: height,
        zIndex: 10, // Handles all touches
    },
});