import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { View, Dimensions, StyleSheet, Text, TouchableOpacity, Platform, InteractionManager } from 'react-native';
// Retaining Svg import as it seems required, despite the resolution error
import * as Svg from 'react-native-svg'; 

const { Path, G, Text: SvgText } = Svg;
const { width, height } = Dimensions.get('window');

// --- COLOR PALETTE ---
const COLORS = {
    BACKGROUND: '#f0f0f0', 
    KEY_PRIMARY: '#1e40af', // Blue
    KEY_SPECIAL: '#3b82f6', // Light Blue
    WHITE: '#ffffff',
    TEXT_INPUT_BG: '#ffffff',
    RED: '#ef4444', 
};

// --- KEY DATA STRUCTURE (Includes Alpha and Numeric Modes) ---
const KEY_MAPS = {
    // Standard QWERTY Layout
    alpha: [
        { chars: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], type: 'alpha' }, 
        { chars: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], type: 'alpha' }, 
        { chars: ['Z', 'X', 'C', 'V', 'B', 'N', 'M'], type: 'alpha' }, 
    ],
    // Simple Numeric Layout
    numeric: [
        { chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], type: 'alpha' }, 
        { chars: ['@', '#', '$', '%', '&', '*', '(', ')', '_', '+'], type: 'alpha' }, 
        { chars: ['-', '/', ':', ';', '(', '"', '?', '!', '.', ','], type: 'alpha' }, 
    ]
};

// --- CENTRALIZED KEYBOARD CONFIGURATION (LEFT-HANDED MODE) ---
const KEYBOARD_CONFIG_DEFAULTS = {
    RADIUS_FACTOR: 1.25,
    ARC_CENTER_X_FACTOR: 1.25, // Far right for left-hand arc
    ARC_CENTER_Y_ADJUSTMENT: 60, 
    BOTTOM_INSET_PIXELS: Platform.OS === 'ios' ? 34 : 20, 
    
    KEY_WIDTH_ANGLE: 5.5, 
    KEY_PADDING_ANGLE: 0.2, 
    RADIUS_STEP: 55, 
    START_ANGLE: 35, // P is the starting point
    SWEEP_DIRECTION: -1, // Sweep counter-clockwise
    
    TOUCH_AREA_WIDTH: 50, 
    SWIPE_THRESHOLD: 50, 
};

const { KEY_WIDTH_ANGLE, KEY_PADDING_ANGLE, SWEEP_DIRECTION, TOUCH_AREA_WIDTH } = KEYBOARD_CONFIG_DEFAULTS;


// --- HELPER FUNCTION: Convert polar coordinates to Cartesian ---
const polarToCartesian = (center_x, center_y, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: center_x + (radius * Math.cos(angleInRadians)),
        y: center_y + (radius * Math.sin(angleInRadians))
    };
};

// --- COMPONENT: SVG Arc Visual Renderer (Draws the shape) ---
const ArcVisual = memo(({ keyData, geometry }) => {
    const { keyChar, isSpecial, innerRadius, outerRadius, keyCenterAngle } = keyData;
    const { CENTER_X, CENTER_Y } = geometry;

    const innerStart = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyData.keyStartAngle);
    const innerEnd = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyData.keyEndAngle);
    const outerStart = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyData.keyStartAngle);
    const outerEnd = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyData.keyEndAngle);
    
    const sweepFlag = SWEEP_DIRECTION === -1 ? 0 : 1; 
    
    const arcPath = `
        M ${innerStart.x} ${innerStart.y}
        L ${outerStart.x} ${outerStart.y}
        A ${outerRadius} ${outerRadius} 0 0 ${sweepFlag} ${outerEnd.x} ${outerEnd.y}
        L ${innerEnd.x} ${innerEnd.y}
        A ${innerRadius} ${innerRadius} 0 0 ${1 - sweepFlag} ${innerStart.x} ${innerStart.y}
        Z
    `;

    const textRadius = (innerRadius + outerRadius) / 2;
    const textPosition = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    const rotation = keyCenterAngle - 90;

    return (
        <G>
            <Path
                d={arcPath}
                fill={isSpecial ? COLORS.KEY_SPECIAL : COLORS.KEY_PRIMARY} 
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
                {/* Truncate long keys like 'SHIFT' or 'ENTER' */}
                {keyChar.length > 3 ? keyChar.substring(0, 3) : keyChar}
            </SvgText>
        </G>
    );
});


// --- COMPONENT: The Arc Keyboard Key (Touch Layer) ---
const ArcKey = memo(({ keyData, onPress, geometry }) => {
    const { innerRadius, outerRadius, keyCenterAngle } = keyData;
    const { CENTER_X, CENTER_Y } = geometry;

    const keyHeight = outerRadius - innerRadius;
    const textRadius = (innerRadius + outerRadius) / 2;
    const keyCenterPos = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    const rotation = keyCenterAngle - 90;
    const touchWidth = TOUCH_AREA_WIDTH * (keyData.angleMultiplier || 1);


    return (
        <TouchableOpacity 
            onPress={onPress}
            style={{
                position: 'absolute',
                width: touchWidth, 
                height: keyHeight,
                left: keyCenterPos.x - (touchWidth / 2),
                top: keyCenterPos.y - (keyHeight / 2), 
                transform: [
                    { rotate: `${rotation}deg` }
                ],
                zIndex: 10, 
            }}
        />
    );
});

// --- MAIN APP COMPONENT ---
export default function App() {
    const [typedText, setTypedText] = useState('');
    const [keyboardMode, setKeyboardMode] = useState('alpha'); // 'alpha' or 'numeric'
    const textRef = useRef(''); 
    const swipeStartX = useRef(0);
    
    // --- Dynamic Geometry Calculation ---
    const geometry = useMemo(() => {
        const { 
            RADIUS_FACTOR, ARC_CENTER_X_FACTOR, ARC_CENTER_Y_ADJUSTMENT, 
            BOTTOM_INSET_PIXELS, SWEEP_DIRECTION, START_ANGLE, KEY_WIDTH_ANGLE, 
            KEY_PADDING_ANGLE, RADIUS_STEP, SWIPE_THRESHOLD
        } = KEYBOARD_CONFIG_DEFAULTS;

        const currentWidth = Dimensions.get('window').width;
        const currentHeight = Dimensions.get('window').height;
        const RADIUS_BASE = currentWidth * RADIUS_FACTOR; 
        const CENTER_X = currentWidth * ARC_CENTER_X_FACTOR; 
        const CENTER_Y = currentHeight - BOTTOM_INSET_PIXELS + ARC_CENTER_Y_ADJUSTMENT; 

        return {
            RADIUS_BASE,
            CENTER_X,
            CENTER_Y,
            SWEEP_DIRECTION,
            START_ANGLE,
            KEY_WIDTH_ANGLE,
            KEY_PADDING_ANGLE,
            RADIUS_STEP,
            SWIPE_THRESHOLD
        };
    }, []);

    const handleTextUpdate = useCallback((newText) => {
        textRef.current = newText;
        InteractionManager.runAfterInteractions(() => {
            setTypedText(textRef.current);
        });
    }, []);

    const handleKeyPress = useCallback((char) => {
        let newText = textRef.current;

        if (char === 'SPACE') {
            newText += ' ';
        } else if (char === 'DEL') { 
            newText = newText.slice(0, -1);
        } else if (char === 'ENTER') { 
            newText += '\n';
        } else if (char === 'MODE_TOGGLE') {
            setKeyboardMode(prev => prev === 'alpha' ? 'numeric' : 'alpha');
        } else if (char === 'SHIFT' || char === '123' || char === ':-)') {
            // Placeholder keys that don't change text
        } else {
            newText += char.toLowerCase();
        }
        
        handleTextUpdate(newText);
    }, [handleTextUpdate]);

    // --- SWIPE GESTURE HANDLERS (React Native Responder System) ---
    const handleStartShouldSetResponder = useCallback(() => true, []);

    const handleResponderRelease = useCallback((evt) => {
        const startX = swipeStartX.current;
        const endX = evt.nativeEvent.pageX;
        const dx = endX - startX;

        // Check if a swipe occurred
        if (Math.abs(dx) > geometry.SWIPE_THRESHOLD) {
            if (dx < 0) {
                // Swipe Left -> DELETE
                handleKeyPress('DEL'); 
            } else {
                // Swipe Right -> SPACE
                handleKeyPress('SPACE');
            }
        }
        swipeStartX.current = 0; 
    }, [handleKeyPress, geometry.SWIPE_THRESHOLD]);

    const handleResponderGrant = useCallback((evt) => {
        swipeStartX.current = evt.nativeEvent.pageX;
    }, []);
    
    // --- PRE-CALCULATE ALL KEY GEOMETRY (Runs once per mode change) ---
    const allKeys = useMemo(() => {
        let keys = [];
        let currentKeyIndex = 0;
        const radialStep = geometry.RADIUS_STEP;
        const { RADIUS_BASE, KEY_WIDTH_ANGLE, KEY_PADDING_ANGLE, SWEEP_DIRECTION, START_ANGLE } = geometry;
        const currentRows = KEY_MAPS[keyboardMode];


        const calculateKeyGeometry = (char, index, innerRadius, outerRadius, angleMultiplier = 1, isSpecial = false) => {
            const angleSize = KEY_WIDTH_ANGLE * angleMultiplier;
            const effectiveAngle = (KEY_WIDTH_ANGLE + KEY_PADDING_ANGLE) * SWEEP_DIRECTION;

            const startOffset = index * effectiveAngle;
            
            const keyEndAngle = START_ANGLE + startOffset;
            const keyStartAngle = keyEndAngle + (angleSize * SWEEP_DIRECTION);
            
            const visualStartAngle = Math.min(keyStartAngle, keyEndAngle);
            const visualEndAngle = Math.max(keyStartAngle, keyEndAngle);


            return {
                keyChar: char,
                isSpecial,
                innerRadius,
                outerRadius,
                keyCenterAngle: (keyStartAngle + keyEndAngle) / 2, 
                keyStartAngle: visualStartAngle, 
                keyEndAngle: visualEndAngle, 
                angleMultiplier
            };
        };

        // --- Standard Rows (QWERTY / Numerics) ---
        // Row 1 (Outermost)
        let rowAngleStart = 10;
        currentRows[0].chars.forEach(char => {
            const outerRadius = RADIUS_BASE;
            const innerRadius = outerRadius - radialStep;
            keys.push(calculateKeyGeometry(char, rowAngleStart, innerRadius, outerRadius, 1, false));
            rowAngleStart++; 
        });

        // Row 2 (Middle)
        rowAngleStart = 12; 
        currentRows[1].chars.forEach(char => {
            const outerRadius = RADIUS_BASE - radialStep;
            const innerRadius = outerRadius - radialStep;
            keys.push(calculateKeyGeometry(char, rowAngleStart, innerRadius, outerRadius, 1, false));
            rowAngleStart++; 
        });

        // Row 3 (Innermost)
        rowAngleStart = 14; 
        currentRows[2].chars.forEach(char => {
            const outerRadius = RADIUS_BASE - (2 * radialStep);
            const innerRadius = outerRadius - radialStep;
            keys.push(calculateKeyGeometry(char, rowAngleStart, innerRadius, outerRadius, 1, false));
            rowAngleStart++; 
        });


        // --- Special Keys (Fixed Positions) ---
        const specialOuterRadius = RADIUS_BASE + radialStep;
        const specialInnerRadius = RADIUS_BASE;
        const innermostOuterRadius = RADIUS_BASE - (3 * radialStep);
        const innermostInnerRadius = innermostOuterRadius - radialStep;

        
        // 1. SHIFT (Outermost, Leftmost)
        keys.push(calculateKeyGeometry('SHIFT', 26, specialInnerRadius, specialOuterRadius, 2.5, true));
        
        // 2. SPACE (Outermost, Centered for swiping)
        keys.push(calculateKeyGeometry('SPACE', 5, specialInnerRadius, specialOuterRadius, 6, true));

        // 3. MODE TOGGLE (Innermost layer, Leftmost)
        const modeChar = keyboardMode === 'alpha' ? '123' : 'ABC';
        keys.push(calculateKeyGeometry('MODE_TOGGLE', 14, innermostInnerRadius, innermostOuterRadius, 2.5, true));
        
        // 4. DELETE (Innermost layer, Next to Mode Toggle)
        keys.push(calculateKeyGeometry('DEL', 18, innermostInnerRadius, innermostOuterRadius, 2.5, true));

        // 5. ENTER (Innermost layer, Rightmost)
        keys.push(calculateKeyGeometry('ENTER', 22, innermostInnerRadius, innermostOuterRadius, 3, true));
        


        return keys;
    }, [geometry, keyboardMode]); 
    

    return (
        <View style={styles.container}>
            
            {/* Header/Input Area */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Left-Hand Arc Keypad ({keyboardMode.toUpperCase()})</Text>
                <View style={styles.inputBox}>
                    <Text style={styles.typedText} selectable={false}>
                        {typedText || 'Tap a key, or swipe left (DEL) / right (SPACE)...'}
                    </Text>
                    <TouchableOpacity 
                        onPress={() => handleTextUpdate('')}
                        style={typedText ? styles.clearButton : styles.clearButtonDisabled}
                        accessibilityLabel="Clear Text"
                    >
                        <Text style={styles.clearButtonText}>X</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Keyboard Area */}
            <View 
                style={styles.keyboardContainer}
                onStartShouldSetResponder={handleStartShouldSetResponder}
                onResponderGrant={handleResponderGrant}
                onResponderRelease={handleResponderRelease}
            > 
                {/* 1. SVG RENDERING LAYER (VISUALS ONLY) */}
                <Svg.Svg
                    height={height} 
                    width={width} 
                    style={styles.svgOverlay}
                >
                    <G> 
                        {allKeys.map((keyData) => (
                            <ArcVisual 
                                key={keyData.keyChar + keyData.keyCenterAngle + keyboardMode} 
                                keyData={keyData} 
                                geometry={geometry}
                            /> 
                        ))}
                    </G>
                </Svg.Svg>
            
                {/* 2. TOUCH LAYER (RESPONSIVENESS ONLY) */}
                <View style={styles.touchOverlay}>
                    {allKeys.map((keyData) => (
                        <ArcKey 
                            key={'touch_' + keyData.keyChar + keyData.keyCenterAngle + keyboardMode} 
                            keyData={keyData} 
                            onPress={() => handleKeyPress(keyData.keyChar)} 
                            geometry={geometry}
                        /> 
                    ))}
                </View>
            </View>
        </View>
    );
}

// --- STYLESHEET (React Native) ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? 25 : 45,
    },
    header: {
        paddingHorizontal: 15,
        paddingBottom: 10,
        backgroundColor: COLORS.TEXT_INPUT_BG,
        borderBottomWidth: 1,
        borderColor: '#ccc',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1e40af', 
        marginBottom: 8,
    },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 5,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#e5e5e5', 
    },
    typedText: {
        fontSize: 18,
        color: '#333',
        flex: 1,
        minHeight: 40,
        paddingHorizontal: 5,
    },
    clearButton: {
        marginLeft: 10,
        padding: 8,
        backgroundColor: COLORS.RED,
        borderRadius: 50,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clearButtonDisabled: {
        marginLeft: 10,
        padding: 8,
        backgroundColor: '#a1a1aa', 
        borderRadius: 50,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clearButtonText: {
        color: COLORS.WHITE,
        fontWeight: 'bold',
        fontSize: 16,
    },
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
        zIndex: 10, 
    },
}); 