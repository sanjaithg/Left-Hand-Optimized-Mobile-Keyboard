import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { 
    View, Dimensions, StyleSheet, Text, 
    TouchableOpacity, Platform, Vibration 
} from 'react-native';
import * as Svg from 'react-native-svg'; 

const { Path, G, Text: SvgText } = Svg;
const { width, height } = Dimensions.get('window');

/* =========================
   CONFIG & UTILITIES
   ========================= */

const COLORS = {
    BACKGROUND: '#f2f2f2', 
    KEY_PRIMARY: '#2b2b2b',   
    KEY_SPECIAL: '#4a4a4a',       
    WHITE: '#fff',
    TEXT_INPUT_BG: '#ffffff',
    RED: '#e02424',
    ACCENT: '#007aff', 
    CURSOR: '#007aff',
};

const KEYBOARD_CONFIG = {
    RADIUS_BASE: width * 1.25, 
    ARC_CENTER_X_OFFSET: width * -0.2, 
    ARC_CENTER_Y_ADJUSTMENT: 40, 
    BOTTOM_INSET_PIXELS: Platform.OS === 'ios' ? 34 : 20, 
    RADIUS_STEP: 55, 
    TOUCH_AREA_WIDTH: 55,
};

// --- CALCULATED CONSTANTS ---
const RADIUS_BASE = KEYBOARD_CONFIG.RADIUS_BASE;   
const KEYBOARD_HEIGHT = height; 
const CENTER_X = KEYBOARD_CONFIG.ARC_CENTER_X_OFFSET; 
const CENTER_Y = KEYBOARD_HEIGHT - KEYBOARD_CONFIG.BOTTOM_INSET_PIXELS + KEYBOARD_CONFIG.ARC_CENTER_Y_ADJUSTMENT; 
const { RADIUS_STEP } = KEYBOARD_CONFIG;


/* =========================
   1. LAYOUT CONFIGURATION
   ========================= */

const LAYOUT_ALPHA = [
    // Row 0 (QWERTY) - Starts at 15
    { 
        chars: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], 
        radialDepth: 0, 
        startAngle: 15,  
        keyWidth: 5.5,    
        gap: 0.2          
    }, 
    // Row 1 (ASDF) - Starts at 18 (Staggered)
    { 
        chars: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], 
        radialDepth: 1, 
        startAngle: 18, 
        keyWidth: 5.5, 
        gap: 0.2 
    }, 
    // Row 2 (SHIFT + ZXCV + DELETE) - Moved Special keys here!
    // Starts at 8 to make room for SHIFT on the left of Z
    { 
        chars: ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE'], 
        radialDepth: 2, 
        startAngle: 15, 
        keyWidth: 5.6, 
        gap: 0.25 
    }, 
];

const LAYOUT_NUMERIC = [
    { 
        chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], 
        radialDepth: 0, startAngle: 15, keyWidth: 5.5, gap: 0.2 
    }, 
    { 
        chars: ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'], 
        radialDepth: 1, startAngle: 18, keyWidth: 5.5, gap: 0.2 
    }, 
    { 
        chars: ['SHIFT', '*', '"', "'", ':', ';', '!', '?', 'DELETE'], 
        radialDepth: 2, startAngle: 8, keyWidth: 5.6, gap: 0.25 
    }, 
];


// Helper: Polar to Cartesian
const polarToCartesian = (center_x, center_y, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: center_x + (radius * Math.cos(angleInRadians)),
        y: center_y + (radius * Math.sin(angleInRadians))
    };
};

/* =========================
   VISUAL COMPONENTS
   ========================= */

const ArcVisual = memo(({ keyData, isShifted }) => {
    const { keyChar, isSpecial, innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle } = keyData;

    // Safety check
    const allValid = [innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle].every(v => typeof v === 'number' && isFinite(v));
    if (!allValid) return null;

    const innerStart = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyStartAngle);
    const innerEnd = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyEndAngle);
    const outerStart = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyStartAngle);
    const outerEnd = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyEndAngle);
    
    // SVG Path Definition
    const arcPath = `
        M ${innerStart.x} ${innerStart.y}
        L ${outerStart.x} ${outerStart.y}
        A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}
        L ${innerEnd.x} ${innerEnd.y}
        A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}
        Z
    `;

    const textRadius = (innerRadius + outerRadius) / 2;
    const textPosition = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    
    // Rotation: 90 degrees clockwise relative to key center
    const rotation = keyCenterAngle; 

    // Styling Logic
    let keyFill = isSpecial ? COLORS.KEY_SPECIAL : COLORS.KEY_PRIMARY;
    if (keyChar === 'SHIFT' && isShifted) keyFill = COLORS.ACCENT;
    if (keyChar === 'DELETE' || keyChar === 'RETURN') keyFill = COLORS.RED;
    if (keyChar === '123' || keyChar === 'ABC') keyFill = COLORS.ACCENT;
    if (keyChar === '<' || keyChar === '>') keyFill = '#555'; 

    // Label Logic
    let displayChar = keyChar;
    if (keyChar === 'SHIFT') displayChar = '⇧';
    if (keyChar === 'DELETE') displayChar = '⌫';
    if (keyChar === 'RETURN') displayChar = '↵';
    if (keyChar === 'SPACE') displayChar = 'space';
    if (keyChar === '<') displayChar = '←';
    if (keyChar === '>') displayChar = '→';
    
    // Case switching
    if (keyChar.length === 1 && /[a-zA-Z]/.test(keyChar)) {
        displayChar = isShifted ? keyChar.toUpperCase() : keyChar.toLowerCase();
    }
    
    return (
        <G>
            <Path
                d={arcPath}
                fill={keyFill} 
                stroke={COLORS.WHITE}
                strokeWidth="1"
            />
            <SvgText
                x={textPosition.x}
                y={textPosition.y}
                fontSize="15" 
                fontWeight="bold"
                fill={COLORS.WHITE}
                textAnchor="middle" 
                alignmentBaseline="middle"
                transform={`rotate(${rotation} ${textPosition.x} ${textPosition.y})`}
            >
                {displayChar}
            </SvgText>
        </G>
    );
});


const ArcKey = memo(({ keyData, onPress }) => {
    const { 
        keyChar, innerRadius, outerRadius, 
        keyCenterAngle, widthAngle
    } = keyData;

    const keyHeight = outerRadius - innerRadius;
    const textRadius = (innerRadius + outerRadius) / 2;
    const keyCenterPos = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    const rotation = keyCenterAngle - 90;
    
    const approximateWidth = textRadius * (widthAngle * Math.PI / 180);

    return (
        <TouchableOpacity 
            onPress={() => onPress(keyChar)}
            delayPressIn={0} 
            activeOpacity={0.3}
            style={{
                position: 'absolute',
                width: approximateWidth + 10, 
                height: keyHeight,
                left: keyCenterPos.x - ((approximateWidth + 10) / 2),
                top: keyCenterPos.y - (keyHeight / 2), 
                transform: [{ rotate: `${rotation}deg` }],
                backgroundColor: 'transparent',
                zIndex: 10, 
            }}
        />
    );
});

/* =========================
   MAIN APP COMPONENT
   ========================= */

export default function App() {
    const [typedText, setTypedText] = useState('');
    const [cursorIndex, setCursorIndex] = useState(0); 
    const [isShifted, setIsShifted] = useState(false); 
    const [layoutMode, setLayoutMode] = useState('ALPHA');

    const handleKeyPress = useCallback((char) => {
        Vibration.vibrate(10); 
        
        setTypedText(currentText => {
            let newText = currentText;

            if (char === '<') {
                setCursorIndex(prev => Math.max(0, prev - 1));
                return currentText;
            }
            if (char === '>') {
                setCursorIndex(prev => Math.min(currentText.length, prev + 1));
                return currentText;
            }

            if (char === 'SHIFT') {
                setIsShifted(prev => !prev);
                return currentText;
            }
            if (char === '123') {
                setLayoutMode('NUMERIC');
                return currentText;
            }
            if (char === 'ABC') {
                setLayoutMode('ALPHA');
                return currentText;
            }

            if (char === 'DELETE') {
                if (cursorIndex > 0) {
                    newText = currentText.slice(0, cursorIndex - 1) + currentText.slice(cursorIndex);
                    setCursorIndex(prev => prev - 1);
                }
                return newText;
            }

            if (char === 'RETURN') {
                 newText = currentText.slice(0, cursorIndex) + '\n' + currentText.slice(cursorIndex);
                 setCursorIndex(prev => prev + 1);
                 return newText;
            }

            let textToAdd = char;
            if (char === 'SPACE') textToAdd = ' ';
            else if (layoutMode === 'ALPHA') {
                textToAdd = isShifted ? char.toUpperCase() : char.toLowerCase();
            }

            newText = currentText.slice(0, cursorIndex) + textToAdd + currentText.slice(cursorIndex);
            setCursorIndex(prev => prev + 1);

            return newText;
        });

        if (isShifted && char.length === 1 && char !== '<' && char !== '>') setIsShifted(false);

    }, [isShifted, layoutMode, cursorIndex]);


    // --- GEOMETRY ENGINE ---
    const allKeys = useMemo(() => {
        const keys = [];
        const activeLayout = layoutMode === 'ALPHA' ? LAYOUT_ALPHA : LAYOUT_NUMERIC;

        const calculateKeyGeometry = (char, startAngle, widthAngle, innerRadius, outerRadius, isSpecial = false) => {
            const keyEndAngle = startAngle + widthAngle;
            const keyCenterAngle = startAngle + (widthAngle / 2);

            return {
                keyChar: char,
                isSpecial,
                innerRadius,
                outerRadius,
                keyCenterAngle,
                keyStartAngle: startAngle, 
                keyEndAngle,   
                widthAngle 
            };
        };

        // 1. Generate Main Rows (With Auto-Width Logic for Shift/Delete)
        activeLayout.forEach((row) => {
            const outerRadius = RADIUS_BASE - (row.radialDepth * RADIUS_STEP);
            const innerRadius = outerRadius - RADIUS_STEP;
            let currentAngle = row.startAngle; 
            
            row.chars.forEach(char => {
                // Logic: If key label length > 1 (like SHIFT, DELETE), make it wider (9 deg)
                // Otherwise use the row's default width (5.5 deg)
                const thisKeyWidth = char.length > 1 ? 9 : row.keyWidth;
                const isSpecial = char.length > 1;

                keys.push(calculateKeyGeometry(char, currentAngle, thisKeyWidth, innerRadius, outerRadius, isSpecial));
                
                currentAngle += (thisKeyWidth + row.gap); 
            });
        });

        // 2. Generate Control Row (Bottom-most Arc)
        // Re-centered for 15 degree start
        const controlRowDepth = 3; 
        const controlOuterRadius = RADIUS_BASE - (controlRowDepth * RADIUS_STEP);
        const controlInnerRadius = controlOuterRadius - RADIUS_STEP;

        // 123 / ABC (Start: 19)
        const toggleLabel = layoutMode === 'ALPHA' ? '123' : 'ABC';
        keys.push(calculateKeyGeometry(toggleLabel, 19, 7, controlInnerRadius, controlOuterRadius, true)); 

        // LEFT Arrow (Start: 27)
        keys.push(calculateKeyGeometry('<', 27, 7, controlInnerRadius, controlOuterRadius, true));

        // Spacebar (Start: 35, Width: 20) - Centered roughly under the keyboard
        keys.push(calculateKeyGeometry('SPACE', 35, 20, controlInnerRadius, controlOuterRadius, true)); 

        // RIGHT Arrow (Start: 56)
        keys.push(calculateKeyGeometry('>', 56, 7, controlInnerRadius, controlOuterRadius, true));

        // Return (Start: 64)
        keys.push(calculateKeyGeometry('RETURN', 64, 7, controlInnerRadius, controlOuterRadius, true));

        return keys;
    }, [width, height, layoutMode]); 

    const renderTextWithCursor = () => {
        const beforeCursor = typedText.slice(0, cursorIndex);
        const afterCursor = typedText.slice(cursorIndex);
        return (
            <Text style={styles.typedText}>
                {beforeCursor}
                <Text style={{ color: COLORS.CURSOR, fontWeight: 'bold' }}>|</Text>
                {afterCursor}
            </Text>
        );
    };

    return (
        <View style={styles.container}>
            
            <View style={styles.inputContainer}>
                {renderTextWithCursor()}
                <TouchableOpacity 
                    style={styles.deleteButton} 
                    onPress={() => handleKeyPress('DELETE')}
                    delayPressIn={0}
                >
                    <Text style={styles.deleteButtonText}>⌫</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.suggestionRow}>
                <Text style={{ color: '#999', fontSize: 12 }}>
                    {layoutMode === 'NUMERIC' ? 'Numbers' : 'Alpha'} | Cursor: {cursorIndex}
                </Text>
            </View>

            <View style={styles.keyboardContainer}> 
                <Svg.Svg height={KEYBOARD_HEIGHT} width={width} style={styles.svgOverlay}>
                    <G> 
                        {allKeys.map((keyData) => (
                            <ArcVisual 
                                key={keyData.keyChar + keyData.keyCenterAngle} 
                                keyData={keyData} 
                                isShifted={isShifted}
                            /> 
                        ))}
                    </G>
                </Svg.Svg>
                
                <View style={styles.touchOverlay}>
                    {allKeys.map((keyData) => (
                        <ArcKey 
                            key={'touch_' + keyData.keyChar + keyData.keyCenterAngle} 
                            keyData={keyData} 
                            onPress={handleKeyPress} 
                        /> 
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? 30 : 50,
    },
    inputContainer: {
        backgroundColor: COLORS.TEXT_INPUT_BG,
        borderBottomWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 15,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    typedText: {
        fontSize: 22,
        color: '#000',
        flex: 1,
        minHeight: 30,
        fontWeight: '500',
    },
    deleteButton: {
        padding: 10,
        backgroundColor: '#eee',
        borderRadius: 8,
        marginLeft: 10,
    },
    deleteButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.RED,
    },
    suggestionRow: {
        flexDirection: 'row',
        paddingVertical: 2,
        justifyContent: 'center',
        alignItems: 'center',
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