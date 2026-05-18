#include "../interpreter.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

void UnixSetupFunc(Picoc *pc)
{
}

void Ctest (struct ParseState *Parser, struct Value *ReturnValue,
	struct Value **Param, int NumArgs)
{
    printf("test(%d)\n", Param[0]->Val->Integer);
    Param[0]->Val->Integer = 1234;
}

void Clineno (struct ParseState *Parser, struct Value *ReturnValue,
	struct Value **Param, int NumArgs)
{
    ReturnValue->Val->Integer = Parser->Line;
}

#ifdef __EMSCRIPTEN__
EM_ASYNC_JS(void, HostRobotMoveForward, (int distance, int speed), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.moveForward) {
        await bridge.moveForward(distance, speed);
    }
});

EM_ASYNC_JS(void, HostRobotMoveBackward, (int distance, int speed), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.moveBackward) {
        await bridge.moveBackward(distance, speed);
    }
});

EM_ASYNC_JS(void, HostRobotTurnLeft, (int angle, int speed), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.turnLeft) {
        await bridge.turnLeft(angle, speed);
    }
});

EM_ASYNC_JS(void, HostRobotTurnRight, (int angle, int speed), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.turnRight) {
        await bridge.turnRight(angle, speed);
    }
});

EM_ASYNC_JS(void, HostRobotWait, (double seconds), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.waitSeconds) {
        await bridge.waitSeconds(seconds);
    }
});

EM_ASYNC_JS(void, HostRobotStop, (), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.stop) {
        await bridge.stop();
    }
});

EM_JS(double, HostRobotReadSensor, (const char *sensorName), {
    const bridge = globalThis.robotHostBridge;
    const sensor = UTF8ToString(sensorName);
    if (bridge && bridge.readSensor) {
        const value = Number(bridge.readSensor(sensor));
        return Number.isFinite(value) ? value : 0;
    }
    return 0;
});

EM_JS(void, HostRobotSay, (const char *text), {
    const bridge = globalThis.robotHostBridge;
    const message = UTF8ToString(text);
    if (bridge && bridge.say) {
        bridge.say(message);
    } else {
        console.log(message);
    }
});

EM_ASYNC_JS(void, HostRobotReset, (), {
    const bridge = globalThis.robotHostBridge;
    if (bridge && bridge.reset) {
        await bridge.reset();
    }
});

static void RobotMoveForward(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotMoveForward(Param[0]->Val->Integer, Param[1]->Val->Integer);
}

static void RobotMoveBackward(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotMoveBackward(Param[0]->Val->Integer, Param[1]->Val->Integer);
}

static void RobotTurnLeft(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotTurnLeft(Param[0]->Val->Integer, Param[1]->Val->Integer);
}

static void RobotTurnRight(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotTurnRight(Param[0]->Val->Integer, Param[1]->Val->Integer);
}

static void RobotWait(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotWait(Param[0]->Val->FP);
}

static void RobotStop(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotStop();
}

static void RobotReset(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotReset();
}

static void RobotSay(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    HostRobotSay((const char *)Param[0]->Val->Pointer);
}

static void RobotReadDistance(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    ReturnValue->Val->Integer = (int)HostRobotReadSensor("DISTANCE");
}

static void RobotReadLight(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    ReturnValue->Val->Integer = (int)HostRobotReadSensor("LIGHT");
}

static void RobotReadBattery(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    ReturnValue->Val->Integer = (int)HostRobotReadSensor("BATTERY");
}

static void RobotReadTemperature(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    ReturnValue->Val->FP = HostRobotReadSensor("TEMPERATURE");
}

static void RobotReadSensor(struct ParseState *Parser, struct Value *ReturnValue,
    struct Value **Param, int NumArgs)
{
    ReturnValue->Val->FP = HostRobotReadSensor((const char *)Param[0]->Val->Pointer);
}

static const char RobotDefs[] =
    "#define ROBOT_DEFAULT_MOVE_SPEED 40\n"
    "#define ROBOT_DEFAULT_TURN_SPEED 120\n";

static struct LibraryFunction RobotFunctions[] =
{
    {RobotMoveForward, "void robot_move_forward(int, int);"},
    {RobotMoveBackward, "void robot_move_backward(int, int);"},
    {RobotTurnLeft, "void robot_turn_left(int, int);"},
    {RobotTurnRight, "void robot_turn_right(int, int);"},
    {RobotWait, "void robot_wait(double);"},
    {RobotStop, "void robot_stop(void);"},
    {RobotReset, "void robot_reset(void);"},
    {RobotSay, "void robot_say(char *);"},
    {RobotReadDistance, "int robot_read_distance(void);"},
    {RobotReadLight, "int robot_read_light(void);"},
    {RobotReadBattery, "int robot_read_battery(void);"},
    {RobotReadTemperature, "double robot_read_temperature(void);"},
    {RobotReadSensor, "double robot_read_sensor(char *);"},
    {NULL, NULL}
};
#endif

/* list of all library functions and their prototypes */
struct LibraryFunction UnixFunctions[] =
{
    {Ctest, "void test(int);"},
    {Clineno, "int lineno();"},
    {NULL, NULL}
};

void PlatformLibraryInit(Picoc *pc)
{
    IncludeRegister(pc, "picoc_unix.h", &UnixSetupFunc, &UnixFunctions[0], NULL);
#ifdef __EMSCRIPTEN__
    IncludeRegister(pc, "robot.h", NULL, &RobotFunctions[0], RobotDefs);
#endif
}
