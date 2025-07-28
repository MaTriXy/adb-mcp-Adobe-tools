
const fs = require("uxp").storage.localFileSystem;
const app = require("premierepro");
const constants = require("premierepro").Constants;

const {BLEND_MODES, TRACK_TYPE } = require("./consts.js")

const {
    _getSequenceFromId,
    _setActiveSequence,
    setParam,
    getParam,
    addEffect,
    findProjectItem,
    execute,
    getTrack,
    getTrackItems
} = require("./utils.js")

const saveProject = async (command) => {
    let project = await app.Project.getActiveProject()

    project.save()
}

const saveProjectAs = async (command) => {
    let project = await app.Project.getActiveProject()

    const options = command.options;
    const filePath = options.filePath;

    project.saveAs(filePath)
}

const openProject = async (command) => {

    const options = command.options;
    const filePath = options.filePath;

    await app.Project.open(filePath);    
}


const importMedia = async (command) => {

    let options = command.options
    let paths = command.options.filePaths

    let project = await app.Project.getActiveProject()

    let root = await project.getRootItem()
    let originalItems = await root.getItems()

    //import everything into root
    let rootFolderItems = await project.getRootItem()


    let success = await project.importFiles(paths, true, rootFolderItems)
    //TODO: what is not success?

    let updatedItems = await root.getItems()
    
    const addedItems = updatedItems.filter(
        updatedItem => !originalItems.some(originalItem => originalItem.name === updatedItem.name)
      );
      
    let addedProjectItems = [];
    for (const p of addedItems) { 
        addedProjectItems.push({ name: p.name });
    }
    
    return { addedProjectItems };
}


//note: right now, we just always add to the active sequence. Need to add support
//for specifying sequence
const addMediaToSequence = async (command) => {

    let options = command.options
    let itemName = options.itemName
    let id = options.sequenceId

    let project = await app.Project.getActiveProject()
    let sequence = await _getSequenceFromId(id)

    let insertItem = await findProjectItem(itemName, project)

    let editor = await app.SequenceEditor.getEditor(sequence)
  
    const insertionTime = await app.TickTime.createWithTicks(options.insertionTimeTicks.toString());
    const videoTrackIndex = options.videoTrackIndex
    const audioTrackIndex = options.audioTrackIndex
  
    //not sure what this does
    const limitShift = false

    //let f = ((options.overwrite) ? editor.createOverwriteItemAction : editor.createInsertProjectItemAction).bind(editor)
    //let action = f(insertItem, insertionTime, videoTrackIndex, audioTrackIndex, limitShift)
    execute(() => {
        let action = editor.createOverwriteItemAction(insertItem, insertionTime, videoTrackIndex, audioTrackIndex)
        return [action]
    }, project)  
}


const setAudioTrackMute = async (command) => {

    let options = command.options
    let id = options.sequenceId

    let sequence = await _getSequenceFromId(id)

    let track = await sequence.getTrack(options.audioTrackIndex, TRACK_TYPE.AUDIO)
    track.setMute(options.mute)
}



const setVideoClipProperties = async (command) => {

    const options = command.options
    let id = options.sequenceId

    let project = await app.Project.getActiveProject()
    let sequence = await _getSequenceFromId(id)

    if(!sequence) {
        throw new Error(`setVideoClipProperties : Requires an active sequence.`)
    }

    let trackItem = await getTrack(sequence, options.videoTrackIndex, options.trackItemIndex, TRACK_TYPE.VIDEO)

    let opacityParam = await getParam(trackItem, "AE.ADBE Opacity", "Opacity")
    let opacityKeyframe = await opacityParam.createKeyframe(options.opacity)

    let blendModeParam = await getParam(trackItem, "AE.ADBE Opacity", "Blend Mode")

    let mode = BLEND_MODES[options.blendMode.toUpperCase()]
    let blendModeKeyframe = await blendModeParam.createKeyframe(mode)

    execute(() => {
        let opacityAction = opacityParam.createSetValueAction(opacityKeyframe);
        let blendModeAction = blendModeParam.createSetValueAction(blendModeKeyframe);
        return [opacityAction, blendModeAction]
    }, project)

    // /AE.ADBE Opacity
    //Opacity
    //Blend Mode

}

const appendVideoFilter = async (command) => {

    let options = command.options
    let id = options.sequenceId

    let sequence = await _getSequenceFromId(id)

    if(!sequence) {
        throw new Error(`appendVideoFilter : Requires an active sequence.`)
    }

    let trackItem = await getTrackTrack(sequence, options.videoTrackIndex, options.trackItemIndex, TRACK_TYPE.VIDEO)

    let effectName = options.effectName
    let properties = options.properties

    let d = await addEffect(trackItem, effectName)

    for(const p of properties) {
        console.log(p.value)
        await setParam(trackItem, effectName, p.name, p.value)
    }
}


const setActiveSequence = async (command) => {
    let options = command.options
    let id = options.sequenceId

    let sequence = await _getSequenceFromId(id)

    await _setActiveSequence(sequence)
}

const createProject = async (command) => {

    let options = command.options
    let path = options.path
    let name = options.name

    if (!path.endsWith('/')) {
        path = path + '/';
    }

    //todo: this will open a dialog if directory doesnt exist
    let project = await app.Project.createProject(`${path}${name}.prproj`) 


    if(!project) {
        throw new Error("createProject : Could not create project. Check that the directory path exists and try again.")
    }

    //create a default sequence and set it as active
    //let sequence = await project.createSequence("default")
    //await project.setActiveSequence(sequence)
}


const _exportFrame = async (sequence, filePath, seconds) => {

    const fileType = filePath.split('.').pop()

    let size = await sequence.getFrameSize()

    let p = window.path.parse(filePath)
    let t = app.TickTime.createWithSeconds(seconds)

    let out = await app.Exporter.exportSequenceFrame(sequence, t, p.base, p.dir, size.width, size.height)

    let ps = `${p.dir}${window.path.sep}${p.base}`
    let outPath = `${ps}.${fileType}`

    if(!out) {
        throw new Error(`exportFrame : Could not save frame to [${outPath}]`);
    }

    return outPath
}

const exportFrame = async (command) => {
    const options = command.options;
    let id = options.sequenceId;
    let filePath = options.filePath;
    let seconds = options.seconds;

    let sequence = await _getSequenceFromId(id);

    const outPath = await _exportFrame(sequence, filePath, seconds);

    return {"filePath": outPath}
}

const setClipDisabled = async (command) => {

    const options = command.options;
    const id = options.sequenceId;
    const trackIndex = options.trackIndex;
    const trackItemIndex = options.trackItemIndex;
    const trackType = options.trackType;

    let project = await app.Project.getActiveProject()
    let sequence = await _getSequenceFromId(id)

    if(!sequence) {
        throw new Error(`setClipDisabled : Requires an active sequence.`)
    }

    let trackItem = await getTrack(sequence, trackIndex, trackItemIndex, trackType)

    execute(() => {
        let action = trackItem.createSetDisabledAction(options.disabled)
        return [action]
    }, project)

}


const appendVideoTransition = async (command) => {

    let options = command.options
    let id = options.sequenceId

    let project = await app.Project.getActiveProject()
    let sequence = await _getSequenceFromId(id)

    if(!sequence) {
        throw new Error(`appendVideoTransition : Requires an active sequence.`)
    }

    let trackItem = await getTrack(sequence, options.videoTrackIndex, options.trackItemIndex,TRACK_TYPE.VIDEO)

    let transition = await app.TransitionFactory.createVideoTransition(options.transitionName);

    let transitionOptions = new app.AddTransitionOptions()
    transitionOptions.setApplyToStart(false)

    const time = await app.TickTime.createWithSeconds(options.duration)
    transitionOptions.setDuration(time)
    transitionOptions.setTransitionAlignment(options.clipAlignment)

    execute(() => {
        let action = trackItem.createAddVideoTransitionAction(transition, transitionOptions)
        return [action]
    }, project)
}


const getProjectInfo = async (command) => {
    return {}
}



const createSequenceFromMedia = async (command) => {

    let options = command.options

    let itemNames = options.itemNames
    let sequenceName = options.sequenceName

    let project = await app.Project.getActiveProject()

    let found = false
    try {
        await findProjectItem(sequenceName, project)
        found  = true
    } catch {
        //do nothing
    }

    if(found) {
        throw Error(`createSequenceFromMedia : sequence name [${sequenceName}] is already in use`)
    }

    let items = []
    for (const name of itemNames) {

        //this is a little inefficient
        let insertItem = await findProjectItem(name, project)
        items.push(insertItem)
    }


    let root = await project.getRootItem()
    
    let sequence = await project.createSequenceFromMedia(sequenceName, items, root)

    await _setActiveSequence(sequence)
}

const setClipStartEndTimes = async (command) => {
    const options = command.options;

    const sequenceId = options.sequenceId;
    const trackIndex = options.trackIndex;
    const trackItemIndex = options.trackItemIndex;
    const startTimeTicks = options.startTimeTicks;
    const endTimeTicks = options.endTimeTicks;
    const trackType = options.trackType

    const sequence = await _getSequenceFromId(sequenceId)
    let trackItem = await getTrack(sequence, trackIndex, trackItemIndex, trackType)

    const startTick = await app.TickTime.createWithTicks(startTimeTicks.toString());
    const endTick = await app.TickTime.createWithTicks(endTimeTicks.toString());;

    let project = await app.Project.getActiveProject();

    execute(() => {

        let out = []

        out.push(trackItem.createSetStartAction(startTick));
        out.push(trackItem.createSetEndAction(endTick))

        return out
    }, project)
}

const closeGapsOnSequence = async(command) => {
    const options = command.options
    const sequenceId = options.sequenceId;
    const trackIndex = options.trackIndex;
    const trackType = options.trackType;

    let sequence = await _getSequenceFromId(sequenceId)

    let out = await _closeGapsOnSequence(sequence, trackIndex, trackType)
    
    return out
}

const _closeGapsOnSequence = async (sequence, trackIndex, trackType) => {
  
    let project = await app.Project.getActiveProject()

    let items = await getTrackItems(sequence, trackIndex, trackType)

    if(!items || items.length === 0) {
        return;
    }
    
    const f = async (item, targetPosition) => {
        let currentStart = await item.getStartTime()

        let a = await currentStart.ticksNumber
        let b = await targetPosition.ticksNumber
        let shiftAmount = (a - b)// How much to shift 
        
        shiftAmount *= -1;

        let shiftTick = app.TickTime.createWithTicks(shiftAmount.toString())

        return shiftTick
    }

    let targetPosition = app.TickTime.createWithTicks("0")


    for(let i = 0; i < items.length; i++) {
        let item = items[i];
        let shiftTick = await f(item, targetPosition)
        
        execute(() => {
            let out = []

                out.push(item.createMoveAction(shiftTick))

            return out
        }, project)
        
        targetPosition = await item.getEndTime()
    }
}

//TODO: change API to take trackType?

//TODO: pass in scope here
const removeItemFromSequence = async (command) => {
    const options = command.options;

    const sequenceId = options.sequenceId;
    const trackIndex = options.trackIndex;
    const trackItemIndex = options.trackItemIndex;
    const rippleDelete = options.rippleDelete;
    const trackType = options.trackType

    let project = await app.Project.getActiveProject()
    let sequence = await _getSequenceFromId(sequenceId)

    if(!sequence) {
        throw Error(`addMarkerToSequence : sequence with id [${sequenceId}] not found.`)
    }

    let item = await getTrack(sequence, trackIndex, trackItemIndex, trackType);

    let editor = await app.SequenceEditor.getEditor(sequence)

    let trackItemSelection = await sequence.getSelection();
    let items = await trackItemSelection.getTrackItems()

    for (let t of items) {
        await trackItemSelection.removeItem(t)
    }

    trackItemSelection.addItem(item, true)

    execute(() => {
        const shiftOverlapping = false
        let action = editor.createRemoveItemsAction(trackItemSelection, rippleDelete, constants.MediaType.ANY, shiftOverlapping )
        return [action]
    }, project)
}

const addMarkerToSequence = async (command) => {
    const options = command.options;
    const sequenceId = options.sequenceId;
    const markerName = options.markerName;
    const startTimeTicks = options.startTimeTicks;
    const durationTicks = options.durationTicks;
    const comments = options.comments;

    const sequence = await _getSequenceFromId(sequenceId)

    if(!sequence) {
        throw Error(`addMarkerToSequence : sequence with id [${sequenceId}] not found.`)
    }

    let markers = await app.Markers.getMarkers(sequence);

    let project = await app.Project.getActiveProject()

    execute(() => {

        let start = app.TickTime.createWithTicks(startTimeTicks.toString())
        let duration = app.TickTime.createWithTicks(durationTicks.toString())

        let action = markers.createAddMarkerAction(markerName, "WebLink",  start, duration, comments)
        return [action]
    }, project)

}

const moveProjectItemsToBin = async (command) => {
    const options = command.options;
    const binName = options.binName;
    const projectItemNames = options.itemNames;

    const project = await app.Project.getActiveProject()
    
    const binFolderItem = await findProjectItem(binName, project)

    if(!binFolderItem) {
        throw Error(`moveProjectItemsToBin : Bin with name [${binName}] not found.`)
    }

    let folderItems = [];

    for(let name of projectItemNames) {
        let item = await findProjectItem(name, project)

        if(!item) {
            throw Error(`moveProjectItemsToBin : FolderItem with name [${name}] not found.`)
        }

        folderItems.push(item)
    }

    const rootFolderItem = await project.getRootItem()

    execute(() => {

        let actions = []

        for(let folderItem of folderItems) {
            let b = app.FolderItem.cast(binFolderItem)
            let action = rootFolderItem.createMoveItemAction(folderItem, b)
            actions.push(action)
        }

        return actions
    }, project)

}

const createBinInActiveProject = async (command) => {

    const options = command.options;
    const binName = options.binName;

    const project = await app.Project.getActiveProject()
    const folderItem = await project.getRootItem()

    execute(() => {
        let action = folderItem.createBinAction(binName, true)
        return [action]
    }, project)

}

const commandHandlers = {
    moveProjectItemsToBin,
    createBinInActiveProject,
    addMarkerToSequence,
    closeGapsOnSequence,
    removeItemFromSequence,
    setClipStartEndTimes,
    openProject,
    saveProjectAs,
    saveProject,
    getProjectInfo,
    setActiveSequence,
    exportFrame,
    setVideoClipProperties,
    createSequenceFromMedia,
    setAudioTrackMute,
    setClipDisabled,
    appendVideoTransition,
    appendVideoFilter,
    addMediaToSequence,
    importMedia,
    createProject,
};

module.exports = {
    commandHandlers
}