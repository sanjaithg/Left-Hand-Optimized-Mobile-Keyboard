import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { View, Dimensions, StyleSheet, Text, TouchableOpacity, Platform, InteractionManager } from 'react-native';
import * as Svg from 'react-native-svg'; // <-- SVG IS BACK FOR VISUALS

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
  
  // --- Native View Specifics (For simplified touch area) ---
  TOUCH_AREA_WIDTH: 50, // This defines the width of the invisible, responsive touch box
  
  // --- Special Keys ---
  SPACEBAR_INDEX_OFFSET: 10, 
  SPACEBAR_ANGLE_MULTIPLIER: 8, 
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

// --- COMPONENT: SVG Arc Visual Renderer (Draws the shape) ---
const ArcVisual = memo(({ keyData }) => {
    const { keyChar, isSpecial, innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle } = keyData;

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
                {keyChar}
            </SvgText>
        </G>
    );
});


// --- COMPONENT: The Arc Keyboard Key (Touch Layer) ---
const ArcKey = memo(({ keyData, onPress }) => {
  const { 
    keyChar, innerRadius, outerRadius, 
    keyCenterAngle
  } = keyData;

  // 1. Calculate the key's center and rotation
  const keyHeight = outerRadius - innerRadius;
  const textRadius = (innerRadius + outerRadius) / 2;
  const keyCenterPos = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
  const rotation = keyCenterAngle - 90;
  const touchWidth = KEYBOARD_CONFIG.TOUCH_AREA_WIDTH * (keyData.angleMultiplier || 1);


  return (
    // This TouchableOpacity is INVISIBLE and only handles the tap event.
    <TouchableOpacity 
        onPress={onPress}
        style={{
            position: 'absolute',
            width: touchWidth, 
            height: keyHeight,
            left: keyCenterPos.x - (touchWidth / 2),
            top: keyCenterPos.y - (keyHeight / 2), 
            transform: [
              { rotate: `${rotation}deg` },
            ],
            // Ensure touch layer is fully invisible but above the SVG
            backgroundColor: 'transparent',
            zIndex: 10, 
        }}
    />
  );
});

// --- MAIN APP COMPONENT ---
export default function App() {
  const [typedText, setTypedText] = useState('');
  const textRef = useRef(''); 
  const [displayTrigger, setDisplayTrigger] = useState(0); 

  const handleTextUpdate = (newText) => {
    textRef.current = newText;
    // Deferral for low-latency visual update
    InteractionManager.runAfterInteractions(() => {
        setTypedText(textRef.current);
        setDisplayTrigger(t => t + 1); 
    });
  };

  const handleKeyPress = useCallback((char) => {
    let newText = textRef.current;

    if (char === 'SPACE') {
      newText += ' ';
    } else if (char === 'DELETE') {
      newText = newText.slice(0, -1);
    } else if (char === 'RETURN') {
      newText += '\n';
    } else if (char === 'SHIFT' || char === '123' || char === ':-)') {
        // Mode keys: no text output
    } else {
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
            keyStartAngle, // Added for visual rendering
            keyEndAngle,   // Added for visual rendering
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
        currentKeyIndex = 0;
    });

    // Add Special Keys (Geometry calculations remain the same)
    const spacebarInnerRadius = RADIUS_BASE - (KEY_ROWS.length * radialStep); 
    const spacebarOuterRadius = spacebarInnerRadius - radialStep; 
    const peripheralRadius = RADIUS_BASE;

    keys.push(calculateKeyGeometry('SPACE', -3, peripheralRadius, peripheralRadius + radialStep, 1.5, true));
    keys.push(calculateKeyGeometry('DELETE', KEYBOARD_CONFIG.SPACEBAR_INDEX_OFFSET + 2, peripheralRadius, peripheralRadius + radialStep, 1.5, true));
    keys.push(calculateKeyGeometry('SHIFT', -1, peripheralRadius, peripheralRadius + radialStep, 1.5, true));
    keys.push(calculateKeyGeometry('123', 10, spacebarInnerRadius - radialStep, spacebarInnerRadius, 1.5, true));
    keys.push(calculateKeyGeometry('RETURN', 25, peripheralRadius - (KEY_ROWS.length * radialStep), peripheralRadius - (KEY_ROWS.length * radialStep) + radialStep, 2, true));

    return keys;
  }, [width, height]); 

  return (
    <View style={styles.container}>
      
      {/* Simple Text Box */}
      <View style={styles.inputContainer}>
        <Text style={styles.typedText} key={displayTrigger}>{typedText || 'Start typing...'}</Text> 
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
                /> 
              ))}
            </G>
        </Svg.Svg>
      
      {/* 2. TOUCH LAYER (RESPONSIVENESS ONLY) */}
        <View style={styles.touchOverlay}>
            {allKeys.map((keyData) => (
                <ArcKey 
                    key={'touch_' + keyData.keyChar + keyData.keyCenterAngle} 
                    keyData={keyData} 
                    onPress={() => handleKeyPress(keyData.keyChar)} 
                /> 
            ))}
        </View>
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
    zIndex: 5, // Rendered underneath touchables
  },
  touchOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 10, // Rendered on top of SVG
  },
  keyText: {
    color: COLORS.WHITE,
    fontWeight: 'bold',
    fontSize: 14, 
    // This text is now handled by the SVG layer, so this style is no longer strictly used, 
    // but kept for compatibility.
  },
});