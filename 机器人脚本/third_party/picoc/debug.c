/* picoc interactive debugger */
#include "interpreter.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <stdio.h>
#include <string.h>

static int gWebDebugEnabled = false;
#endif

#define BREAKPOINT_HASH(p) (((unsigned long)(p)->FileName) ^ (((p)->Line << 16) | ((p)->CharacterPos << 16)))

#ifdef __EMSCRIPTEN__
EM_JS(void, HostDebugBeginSnapshot, (int line), {
    const bridge = globalThis.robotDebugBridge;
    if (bridge && bridge.beginSnapshot) {
        bridge.beginSnapshot(line);
    }
});

EM_JS(void, HostDebugPushVariable, (const char *scope, const char *name, const char *type, const char *value), {
    const bridge = globalThis.robotDebugBridge;
    if (bridge && bridge.pushVariable) {
        bridge.pushVariable(
            UTF8ToString(scope),
            UTF8ToString(name),
            UTF8ToString(type),
            UTF8ToString(value)
        );
    }
});

EM_JS(void, HostDebugCommitSnapshot, (), {
    const bridge = globalThis.robotDebugBridge;
    if (bridge && bridge.commitSnapshot) {
        bridge.commitSnapshot();
    }
});

EM_ASYNC_JS(int, HostDebugWaitForControl, (int line), {
    try {
        const bridge = globalThis.robotDebugBridge;
        if (bridge && bridge.waitForControl) {
            return Number(await bridge.waitForControl(line)) || 0;
        }
    } catch (error) {
        console.error("robotDebugBridge.waitForControl failed", error);
    }

    return 0;
});

static int WebTraceShouldSkip(struct ParseState *Parser)
{
    return Parser == NULL ||
        Parser->pc == NULL ||
        Parser->pc->TopStackFrame == NULL ||
        Parser->FileName == NULL ||
        strcmp(Parser->FileName, "web_input.c") != 0 ||
        Parser->Line <= 0;
}

static int WebTraceShouldExposeValue(const char *name, struct Value *Val)
{
    if (name == NULL || Val == NULL || Val->Typ == NULL || Val->OutOfScope)
        return false;

    if (strncmp(name, "__", 2) == 0)
        return false;

    switch (Val->Typ->Base) {
    case TypeVoid:
    case TypeFunction:
    case TypeMacro:
    case TypeGotoLabel:
    case Type_Type:
        return false;
    default:
        return true;
    }
}

static const char *WebTraceTypeLabel(Picoc *pc, struct Value *Val)
{
    if (Val->Typ->Base == TypeArray && Val->Typ->FromType == &pc->CharType)
        return "string";

    if (Val->Typ->Base == TypePointer && Val->Typ->FromType == &pc->CharType)
        return "string";

    switch (Val->Typ->Base) {
    case TypeInt:
    case TypeShort:
    case TypeChar:
    case TypeLong:
    case TypeEnum:
        return "int";
    case TypeUnsignedInt:
    case TypeUnsignedShort:
    case TypeUnsignedChar:
    case TypeUnsignedLong:
        return "uint";
    case TypeFP:
        return "double";
    case TypePointer:
        return "pointer";
    case TypeArray:
        return "array";
    case TypeStruct:
        return "struct";
    case TypeUnion:
        return "union";
    default:
        return "value";
    }
}

static int WebTraceFormatValue(Picoc *pc, struct Value *Val, char *buffer, size_t bufferSize)
{
    if (bufferSize == 0)
        return false;

    switch (Val->Typ->Base) {
    case TypeInt:
    case TypeShort:
    case TypeChar:
    case TypeLong:
    case TypeEnum:
        snprintf(buffer, bufferSize, "%ld", ExpressionCoerceInteger(Val));
        return true;
    case TypeUnsignedInt:
    case TypeUnsignedShort:
    case TypeUnsignedChar:
    case TypeUnsignedLong:
        snprintf(buffer, bufferSize, "%lu", ExpressionCoerceUnsignedInteger(Val));
        return true;
    case TypeFP:
        snprintf(buffer, bufferSize, "%.6g", ExpressionCoerceFP(Val));
        return true;
    case TypePointer:
        if (Val->Typ->FromType == &pc->CharType) {
            if (Val->Val->Pointer == NULL)
                snprintf(buffer, bufferSize, "NULL");
            else
                snprintf(buffer, bufferSize, "\"%s\"", (const char *)Val->Val->Pointer);
            return true;
        }

        snprintf(buffer, bufferSize, "%p", Val->Val->Pointer);
        return true;
    case TypeArray:
        if (Val->Typ->FromType == &pc->CharType) {
            snprintf(buffer, bufferSize, "\"%s\"", Val->Val->ArrayMem);
            return true;
        }

        snprintf(buffer, bufferSize, "[len=%d]", Val->Typ->ArraySize);
        return true;
    case TypeStruct:
        snprintf(buffer, bufferSize, "<struct%s%s>",
            Val->Typ->Identifier ? " " : "",
            Val->Typ->Identifier ? Val->Typ->Identifier : "");
        return true;
    case TypeUnion:
        snprintf(buffer, bufferSize, "<union%s%s>",
            Val->Typ->Identifier ? " " : "",
            Val->Typ->Identifier ? Val->Typ->Identifier : "");
        return true;
    default:
        return false;
    }
}

static void WebTraceTable(Picoc *pc, struct Table *Table, const char *scopeLabel, const char *sourceFile)
{
    int count;

    for (count = 0; count < Table->Size; count++) {
        struct TableEntry *entry;

        for (entry = Table->HashTable[count]; entry != NULL; entry = entry->Next) {
            struct Value *value = entry->p.v.Val;
            char formatted[160];

            if (entry->DeclFileName == NULL || strcmp(entry->DeclFileName, sourceFile) != 0)
                continue;

            if (!WebTraceShouldExposeValue(entry->p.v.Key, value))
                continue;

            if (!WebTraceFormatValue(pc, value, &formatted[0], sizeof(formatted)))
                continue;

            HostDebugPushVariable(scopeLabel, entry->p.v.Key,
                WebTraceTypeLabel(pc, value), &formatted[0]);
        }
    }
}
#endif

void WebDebugSetEnabled(int Enabled)
{
#ifdef __EMSCRIPTEN__
    gWebDebugEnabled = Enabled;
#else
    (void)Enabled;
#endif
}

void WebTraceCheckStatement(struct ParseState *Parser)
{
#ifdef __EMSCRIPTEN__
    Picoc *pc;
    int debugAction;

    if (WebTraceShouldSkip(Parser))
        return;

    pc = Parser->pc;
    HostDebugBeginSnapshot(Parser->Line);

    if (pc->TopStackFrame != NULL)
        WebTraceTable(pc, &pc->TopStackFrame->LocalTable, "local", Parser->FileName);

    WebTraceTable(pc, &pc->GlobalTable, "global", Parser->FileName);
    HostDebugCommitSnapshot();

    if (!gWebDebugEnabled)
        return;

    debugAction = HostDebugWaitForControl(Parser->Line);
    if (debugAction != 0)
        PlatformExit(pc, debugAction);
#else
    (void)Parser;
#endif
}

#ifdef DEBUGGER
/* initialize the debugger by clearing the breakpoint table */
void DebugInit(Picoc *pc)
{
    TableInitTable(&pc->BreakpointTable, &pc->BreakpointHashTable[0],
        BREAKPOINT_TABLE_SIZE, true);
    pc->BreakpointCount = 0;
}

/* free the contents of the breakpoint table */
void DebugCleanup(Picoc *pc)
{
    struct TableEntry *Entry;
    struct TableEntry *NextEntry;
    int Count;

    for (Count = 0; Count < pc->BreakpointTable.Size; Count++) {
        for (Entry = pc->BreakpointHashTable[Count]; Entry != NULL;
                Entry = NextEntry) {
            NextEntry = Entry->Next;
            HeapFreeMem(pc, Entry);
        }
    }
}

/* search the table for a breakpoint */
static struct TableEntry *DebugTableSearchBreakpoint(struct ParseState *Parser,
    int *AddAt)
{
    struct TableEntry *Entry;
    Picoc *pc = Parser->pc;
    int HashValue = BREAKPOINT_HASH(Parser) % pc->BreakpointTable.Size;

    for (Entry = pc->BreakpointHashTable[HashValue];
            Entry != NULL; Entry = Entry->Next) {
        if (Entry->p.b.FileName == Parser->FileName &&
                Entry->p.b.Line == Parser->Line &&
                Entry->p.b.CharacterPos == Parser->CharacterPos)
            return Entry;   /* found */
    }

    *AddAt = HashValue;    /* didn't find it in the chain */
    return NULL;
}

/* set a breakpoint in the table */
void DebugSetBreakpoint(struct ParseState *Parser)
{
    int AddAt;
    struct TableEntry *FoundEntry = DebugTableSearchBreakpoint(Parser, &AddAt);
    Picoc *pc = Parser->pc;

    if (FoundEntry == NULL) {
        /* add it to the table */
        struct TableEntry *NewEntry = HeapAllocMem(pc, sizeof(*NewEntry));
        if (NewEntry == NULL)
            ProgramFailNoParser(pc, "(DebugSetBreakpoint) out of memory");

        NewEntry->p.b.FileName = Parser->FileName;
        NewEntry->p.b.Line = Parser->Line;
        NewEntry->p.b.CharacterPos = Parser->CharacterPos;
        NewEntry->Next = pc->BreakpointHashTable[AddAt];
        pc->BreakpointHashTable[AddAt] = NewEntry;
        pc->BreakpointCount++;
    }
}

/* delete a breakpoint from the hash table */
int DebugClearBreakpoint(struct ParseState *Parser)
{
    struct TableEntry **EntryPtr;
    Picoc *pc = Parser->pc;
    int HashValue = BREAKPOINT_HASH(Parser) % pc->BreakpointTable.Size;

    for (EntryPtr = &pc->BreakpointHashTable[HashValue];
            *EntryPtr != NULL; EntryPtr = &(*EntryPtr)->Next) {
        struct TableEntry *DeleteEntry = *EntryPtr;
        if (DeleteEntry->p.b.FileName == Parser->FileName &&
                DeleteEntry->p.b.Line == Parser->Line &&
                DeleteEntry->p.b.CharacterPos == Parser->CharacterPos) {
            *EntryPtr = DeleteEntry->Next;
            HeapFreeMem(pc, DeleteEntry);
            pc->BreakpointCount--;

            return true;
        }
    }

    return false;
}

/* before we run a statement, check if there's anything we have to
    do with the debugger here */
void DebugCheckStatement(struct ParseState *Parser)
{
    int DoBreak = false;
    int AddAt;
    Picoc *pc = Parser->pc;

    /* has the user manually pressed break? */
    if (pc->DebugManualBreak) {
        PlatformPrintf(pc->CStdOut, "break\n");
        DoBreak = true;
        pc->DebugManualBreak = false;
    }

    /* is this a breakpoint location? */
    if (Parser->pc->BreakpointCount != 0 &&
            DebugTableSearchBreakpoint(Parser, &AddAt) != NULL)
        DoBreak = true;

    /* handle a break */
    if (DoBreak) {
        PlatformPrintf(pc->CStdOut, "Handling a break\n");
        PicocParseInteractiveNoStartPrompt(pc, false);
    }
}

void DebugStep(void)
{
}
#endif /* DEBUGGER */
