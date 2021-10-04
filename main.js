import * as THREE from 'https://cdn.skypack.dev/three@0.133.0';
import { OrbitControls } from './orbit.js';
const scene = new THREE.Scene();
let scalingFactor = 1;
const rWidth = window.innerWidth * (0.9875 / scalingFactor);
const rHeight = window.innerHeight * (0.975 / scalingFactor);
const camera = new THREE.PerspectiveCamera(75, rWidth / rHeight, 0.1, 1000);
const shaderCam = new THREE.PerspectiveCamera(75, rWidth / rHeight, 0.1, 1000);


const geometry = new THREE.PlaneGeometry(rWidth / rHeight, 1);
const material = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0.0 },
        cameraPos: { value: new THREE.Vector3() },
        viewMat: { value: new THREE.Matrix4() }
    },
    vertexShader: /* glsl */ `
    void main() {
        gl_Position = vec4((uv - 0.5) * 2.0, 0.0, 1.0);
    }
    `,
    fragmentShader: /* glsl */ `
    uniform float time;
    uniform vec3 cameraPos;
    uniform mat4 viewMat;
    float sdSphere(vec3 p, vec3 c, float r) {
        return length(p - c) - r;
    }
    float sdDiamond(vec3 p, vec3 c, float r) {
        vec3 cVector = abs(p - c);
        return (cVector.x + cVector.y + cVector.z) - r;
    }
    float sdPlane( vec3 p, vec4 n )
{
  // n must be normalized
  return dot(p,n.xyz) + n.w;
}  
float sdTorus( vec3 p, vec3 c, vec2 t )
{
  p = p - c;
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return length(q)-t.y;
}
float sdBox( vec3 p, vec3 c, vec3 b )
{
  p = p - c;
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

float sdCone( vec3 p, vec3 center, vec2 c, float h )
{
    p = p - center;
  float q = length(p.xz);
  return max(dot(c.xy,vec2(q,p.y)),-h-p.y);
}
float sdBoxFrame( vec3 p, vec3 c, vec3 b, float e )
{
    p = p - c;
  p = abs(p  )-b;
  vec3 q = abs(p+e)-e;
  return min(min(
      length(max(vec3(p.x,q.y,q.z),0.0))+min(max(p.x,max(q.y,q.z)),0.0),
      length(max(vec3(q.x,p.y,q.z),0.0))+min(max(q.x,max(p.y,q.z)),0.0)),
      length(max(vec3(q.x,q.y,p.z),0.0))+min(max(q.x,max(q.y,p.z)),0.0));
}
float random(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 uv)
{
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    f = f * f * (3. - 2. * f);
    
    float lb = random(i + vec2(0., 0.));
    float rb = random(i + vec2(1., 0.));
    float lt = random(i + vec2(0., 1.));
    float rt = random(i + vec2(1., 1.));
    
    return mix(mix(lb, rb, f.x), 
               mix(lt, rt, f.x), f.y);
}

const int OCTAVES = 8;
float fbm(vec2 uv)
{
    float value = 0.;
    float amplitude = .5;
    
    for (int i = 0; i < OCTAVES; i++)
    {
        value += noise(uv) * amplitude;
        
        amplitude *= .5;
        
        uv *= 2.;
    }
    
    return value;
}

vec3 Sky(vec3 ro, vec3 rd)
{
    const float SC = 1e5;

 	// Calculate sky plane
    float dist = (SC - ro.y) / rd.y; 
    vec2 p = (ro + dist * rd).xz;
    p *= 1.2 / SC;
    
    // from iq's shader, https://www.shadertoy.com/view/MdX3Rr
    vec3 lightDir = normalize(vec3(-.8, .15, -.3));
    float sundot = clamp(dot(rd, lightDir), 0.0, 1.0);
    
    vec3 cloudCol = vec3(1.);
    //vec3 skyCol = vec3(.6, .71, .85) - rd.y * .2 * vec3(1., .5, 1.) + .15 * .5;
    vec3 skyCol = vec3(0.3,0.5,0.85) - rd.y*rd.y*0.5;
    skyCol = mix( skyCol, 0.85 * vec3(0.7,0.75,0.85), pow( 1.0 - max(rd.y, 0.0), 4.0 ) );
    
    // sun
    vec3 sun = 0.25 * vec3(1.0,0.7,0.4) * pow( sundot,5.0 );
    sun += 0.25 * vec3(1.0,0.8,0.6) * pow( sundot,64.0 );
    sun += 0.2 * vec3(1.0,0.8,0.6) * pow( sundot,512.0 );
    skyCol += sun;
    
    // clouds
    float t = time * 0.0001;
    float den = fbm(vec2(p.x - t, p.y - t));
    skyCol = mix( skyCol, cloudCol, smoothstep(.4, .8, den));
    
    // horizon
    skyCol = mix( skyCol,  vec3(0.45, 0.55, 0.75), pow( 1.0 - max(rd.y, 0.0), 16.0 ) );
    
    return skyCol;
}
struct Shifter {
    vec3 position;
    vec3 color;
    float timeOffset;
};
Shifter[9] shifters = Shifter[9](
    Shifter(vec3(0.0, 0.0, 0.0), vec3(1.25, 0.0, 0.0), 0.0),
    Shifter(vec3(5.0, 0.0, 0.0), vec3(0.0, 0.0, 1.25), 3.0),
    Shifter(vec3(-5.0, 0.0, 0.0), vec3(0.0, 1.25, 0.0), 6.0),
    Shifter(vec3(0.0, 0.0, -5.0), vec3(1.25, 1.25, 0.0), 1.0),
    Shifter(vec3(5.0, 0.0, -5.0), vec3(0.0, 1.25, 1.25), 2.0),
    Shifter(vec3(-5.0, 0.0, -5.0), vec3(1.25, 0.0, 1.25), 4.0),
    Shifter(vec3(0.0, 0.0, 5.0), vec3(1.25, 0.65, 0.0), 5.0),
    Shifter(vec3(5.0, 0.0, 5.0), vec3(0.0, 0.65, 1.25), 2.5),
    Shifter(vec3(-5.0, 0.0, 5.0), vec3(0.0, 1.25, 0.65), 3.5)
);
    vec4 scene_dist(vec3 p) {
        float obj_dist = 10000.0;
        vec3 obj_color = vec3(1.0);
        int s = 0;
        float minDist = 10000.0;
        for(int r= 0; r <= shifters.length(); r++) {
            float dist = length(p - shifters[r].position); 
            if (dist < minDist) {
                s = r;
                minDist = dist;
            }
        }
        //for(int s = 0; s <= shifters.length(); s++) {
        float s_dist = 0.0;
        /*if (length(p - shifters[s].position) > 5.0) {
            continue;
        }*/
        //float boxDist = length(shifters[s].position - p); //sdBox(p, shifters[s].position, vec3(1.0, 1.0, 1.0));
        //if (boxDist > obj_dist) {
            //continue;
        //}
       /*if (sdDiamond(p, shifters[s].position, 2.5) > obj_dist) {
            continue;
        }*/
        /*if (time_period < 3.14 * 2.0) {
            obj_dist = mix(sdBox(p, vec3(0.0, ((sin(time / 1000.0) + 1.0) / 2.0), 0.0), vec3(1.0, 1.0, 1.0)), sdTorus(p, vec3(0.0, (sin(time / 1000.0)), 0.0) + 0.05, vec2(1.0, 0.1)), (sin(time / 1000.0) + 1.0) / 2.0);
        } else if (time_period < 3.14 * 4.0) {
            obj_dist = mix(sdBox(p, vec3(0.0, ((sin(time / 1000.0) + 1.0) / 2.0), 0.0), vec3(1.0, 1.0, 1.0)), sdSphere(p, vec3(0.0, ((sin(time / 1000.0) + 1.0) / 2.0), 0.0), 1.0), (sin(time / 1000.0) + 1.0) / 2.0);
        }*/
        float time_period = mod(time / 1000.0 + shifters[s].timeOffset, 5.0);
        if (time_period <= 1.0) {
            s_dist = mix(sdBoxFrame(p, shifters[s].position, vec3(0.9, 0.9, 0.9), 0.25), sdTorus(p, shifters[s].position, vec2(1.0, 0.2)), time_period);
        } else if (time_period <= 2.0) {
            s_dist = mix(sdTorus(p, shifters[s].position, vec2(1.0, 0.2)), sdSphere(p, shifters[s].position, 1.0), time_period - 1.0);
        } else if (time_period <= 3.0) {
            s_dist = mix(sdSphere(p, shifters[s].position, 1.0), sdCone(p, shifters[s].position, vec2(0.5, 0.5), 1.0), time_period - 2.0);
        } else if (time_period <= 4.0) {
            s_dist = mix(sdCone(p, shifters[s].position, vec2(0.5, 0.5), 1.0),  sdBox(p, shifters[s].position, vec3(0.9, 0.9, 0.9)), time_period - 3.0);
        } else if (time_period <= 5.0) {
            s_dist = mix(sdBox(p, shifters[s].position, vec3(0.9, 0.9, 0.9)),sdBoxFrame(p, shifters[s].position, vec3(0.9, 0.9, 0.9), 0.25), time_period - 4.0);
        }
       //s_dist = sdSphere(p, shifters[s].position, 1.0);
            obj_dist = s_dist;
            obj_color =  shifters[s].color;
    //}
        float ground_dist = sdBox(p, vec3(0.0, -1.0, 0.0), vec3(9.5, 0.0, 9.5));
        vec3 color;
        if (ground_dist < obj_dist) {
            color = vec3(0.75);
            if (mod(round(p.x), 2.0) == mod(round(p.z), 2.0)) {
                color = vec3(0.1);
            }
        } else {
            color = obj_color;
        }
        return vec4(min(ground_dist, obj_dist), color);
    }
    vec3 calculate_normal(vec3 p) {
        const vec3 step = vec3(0.001, 0.0, 0.0);
        float gradX = scene_dist(p + step.xyy).x - scene_dist(p - step.xyy).x;
        float gradY = scene_dist(p + step.yxy).x - scene_dist(p - step.yxy).x;
        float gradZ = scene_dist(p + step.yyx).x - scene_dist(p - step.yyx).x;
        return normalize(vec3(gradX, gradY, gradZ));
    }
    bool ray_march_hit(vec3 rayOrigin, vec3 rayDir) {
        float distanceTravelled = 0.0;
        const int NUMBER_OF_STEPS = 32;
        const float MINIMUM_HIT_DISTANCE = 0.001;
        const float MAXIMUM_TRACE_DISTANCE = 1000.0;
        for(int i = 0; i < NUMBER_OF_STEPS; i++) {
            vec3 currPos = rayOrigin + distanceTravelled * rayDir;
            float sceneDist = scene_dist(currPos).x;
            if (sceneDist < MINIMUM_HIT_DISTANCE) {
                return true;
            }
            if (sceneDist > MAXIMUM_TRACE_DISTANCE) {
                break;
            }
            distanceTravelled += sceneDist;
        }
        return false;
    }
    vec3 ray_march_diffuse(vec3 rayOrigin, vec3 rayDir, vec3 diffuse) {
        float distanceTravelled = 0.0;
        const int NUMBER_OF_STEPS = 64;
        const float MINIMUM_HIT_DISTANCE = 0.001;
        const float MAXIMUM_TRACE_DISTANCE = 1000.0;
        const int BOUNCE_AMOUNTS = 3;
        vec3 finalDiffuse = diffuse;
        bool done = false;
        for(int r = 0; r < BOUNCE_AMOUNTS; r++) {
            if (done) {
                break;
            }
            for(int i = 0; i < NUMBER_OF_STEPS; i++) {
                vec3 currPos = rayOrigin + distanceTravelled * rayDir;
                vec4 sceneData = scene_dist(currPos);
                float sceneDist = sceneData.x;
                vec3 sceneDiffuse = sceneData.yzw;
                if (sceneDist < MINIMUM_HIT_DISTANCE) {
                    float addWeight = pow(0.5, float(r + 1));
                    finalDiffuse = (1.0 - addWeight) * finalDiffuse + addWeight * sceneDiffuse;
                    vec3 normal = calculate_normal(currPos);
                    rayOrigin = currPos;
                    rayDir = reflect(rayDir, normal);
                    break;
                }
                if (sceneDist > MAXIMUM_TRACE_DISTANCE) {
                    done = true;
                    break;
                }
                distanceTravelled += sceneDist;
            }
        }
        finalDiffuse = 0.6 * Sky(rayOrigin, rayDir) + 0.4 * finalDiffuse;
        return finalDiffuse;
    }
    vec3 ray_march(vec3 rayOrigin, vec3 rayDir) {
        float distanceTravelled = 0.0;
        const int NUMBER_OF_STEPS = 2048;
        const float MINIMUM_HIT_DISTANCE = 0.001;
        const float MAXIMUM_TRACE_DISTANCE = 1000.0;
        for(int i = 0; i < NUMBER_OF_STEPS; i++) {
            vec3 currPos = rayOrigin + distanceTravelled * rayDir;
            vec4 sceneData = scene_dist(currPos);
            float sceneDist = sceneData.x;
            vec3 sceneDiffuse = sceneData.yzw;
            if (sceneDist < MINIMUM_HIT_DISTANCE) {
                vec3 normal = calculate_normal(currPos);
                vec3 lightPos = vec3(200.0, -500.0, 150.0);
                vec3 dirToLight = normalize(currPos - lightPos);
                float lightIntensity = max(0.2, dot(normal, dirToLight));
                vec3 reflectDir = reflect(rayDir, normal);
                sceneDiffuse = ray_march_diffuse(currPos + reflectDir * 0.002, reflectDir, sceneDiffuse);
                if (ray_march_hit(currPos + dirToLight * 0.01, dirToLight)) {
                    lightIntensity = 0.15;
                }
                return ((sceneDiffuse) / 2.0) * lightIntensity + 0.2 * vec3(1.0, 1.0, 1.0);
            }
            if (sceneDist > MAXIMUM_TRACE_DISTANCE) {
                break;
            }
            distanceTravelled += sceneDist;
        }
        return Sky(rayOrigin, rayDir);
        
    }
    mat4 makeViewMatrix(vec3 eye, vec3 center, vec3 up) {
        vec3 f = normalize(center - eye);
        vec3 s = normalize(cross(f, up));
        vec3 u = cross(s, f);
        return mat4(
            vec4(s, 0.0),
            vec4(u, 0.0),
            vec4(-f, 0.0),
            vec4(0.0, 0.0, 0.0, 1)
        );
    }
    vec3 rayDirection(float fieldOfView, vec2 size, vec2 fragCoord) {
        vec2 xy = fragCoord - size / 2.0;
        float z = size.y / tan(radians(fieldOfView) / 2.0);
        return normalize(vec3(xy, -z));
    }
    void main() {
        /*vec2 uv = (gl_FragCoord.xy/vec2(${rWidth}, ${rHeight}));
        uv -= 0.5;
        uv.x *= ${rWidth / rHeight};
        vec3 cameraPos = vec3(0.0, 0.0, -5.0);
        vec3 rayDirection = vec3(uv, 1.0);  
        vec3 shaded_color = ray_march(cameraPos, rayDirection);*/
        vec3 viewDir = rayDirection(75.0, vec2(${rWidth}, ${rHeight}), gl_FragCoord.xy);
    vec3 eye =cameraPos;
    
    mat4 viewToWorld = viewMat;
    
    vec3 worldDir = (viewToWorld * vec4(viewDir, 0.0)).xyz; 
    vec3 shaded_color = ray_march(eye, worldDir);
        gl_FragColor = vec4(shaded_color, 1.0);
    }
    `
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
camera.position.z = 5.0;
const renderer = new THREE.WebGLRenderer();
renderer.setSize(rWidth, rHeight);
renderer.domElement.style.width = rWidth * scalingFactor + "px";
renderer.domElement.style.height = rHeight * scalingFactor + "px";
renderer.domElement.style.imageRendering = "auto";
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(shaderCam, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2;

shaderCam.position.set(0.0, 0.0, -7.5);
shaderCam.lookAt(0.0, 0.0, 0.0);
controls.update();
var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

function animate() {
    stats.begin();
    requestAnimationFrame(animate);
    controls.update();
    material.uniforms.time.value = performance.now();
    material.uniforms.cameraPos.value = shaderCam.position;
    material.uniforms.viewMat.value = shaderCam.matrix;
    renderer.render(scene, camera);
    stats.end();
}
animate();