import prompts from 'prompts';
import Logger from '@exponentialworkload/logger';
import ytdl, { validateURL } from 'ytdl-core';
import { createWriteStream, unlinkSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import ffmpeg from 'ffmpeg-static'
Logger.postGuillemet=true;
(async()=>{
  const logger = new Logger()
  const response = await prompts({
    initial: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    name: 'url',
    type: 'text',
    message: 'Enter a YT URL',
    validate: (data):boolean|string=>{
      return (ytdl.validateID(data) || validateURL(data)) ? true : 'Invalid ID/URL'
    },
  })
  if (!response || !response.url) return logger.error('No Response URL')
  let status = logger.status('Fetching Information...')
  let info = await ytdl.getInfo(response.url);
  // writeFileSync('metadata.json',JSON.stringify(info,null,2))
  // status.done(true,'ok')
  status.updateStatus('Finding Best Format..')
  const {formats} = info
  status.done_removeLog()
  const highest = ytdl.chooseFormat(formats,{
    quality: 'highest',
  })
  const highestvideo = ytdl.chooseFormat(formats,{
    quality: 'highestvideo'
  })
  const highestaudio = ytdl.chooseFormat(formats,{
    quality: 'highestaudio'
  })
  const safeTitle = encodeURIComponent(info.videoDetails.title).replace(/%20/gui,' ').replace(/%/gui,'_')
  const {format,filename}: {format: typeof highest | undefined | 'merged',filename:string} = await prompts([{
    name: 'format',
    type: 'select',
    message: 'Select a Format',
    choices: [
      {
        title: 'Best Merged',
        description: `Requires ffmpeg | ${highestvideo.qualityLabel}@${highestvideo.fps} (${highestvideo.mimeType}) + ${highestaudio.audioBitrate}kbps (${highestaudio.mimeType}) => mp4`,
        value: 'merged'
      },
      {
        title: 'Best Video',
        description: `${highestvideo.qualityLabel}@${highestvideo.fps} (${highestvideo.mimeType})`,
        value: highestvideo
      },
      {
        title: 'Best Audio',
        description: `${highestaudio.audioBitrate}kbps (${highestaudio.mimeType})`,
        value: highestaudio
      },
      {
        title: 'Auto',
        description: `${highest.qualityLabel}@${highest.fps} (${highest.mimeType})`,
        value: highest
      },
    ]
  },{
    name: 'filename',
    type: 'text',
    message: 'Select a Filename/Filepath',
    initial: (last)=>join(process.cwd(), `${safeTitle}.${last?.container ?? highest.container}`)
  }])
  if (!format || !filename) return logger.error('Cancelled Operation')
  status.resume()
  status.updateStatus('Re-Fetching URLs...')
  info = await ytdl.getInfo(response.url);
  if (format !== 'merged') {
    status.updateStatus('Downloading...')
    ytdl.downloadFromInfo(info,{
      format
    }).pipe(createWriteStream(filename)).on('close',()=>{
      status.done(true,'Downloaded!')
    }).on('error',(err)=>{
      status.done(false,'Error Downloading',err as any)
    })
  } else {
    if (!ffmpeg) return status.done(false,'ffmpeg is not installed!','Please install it from https://ffmpeg.org/')
    status.updateStatus('Downloading Video Track...')
    const videoTrackFile = join(process.cwd(),'tmp.video-track.'+safeTitle+'.'+highestvideo.container);
    const audioTrackFile = join(process.cwd(),'tmp.audio-track.'+safeTitle+'.'+highestaudio.container);
    await new Promise((resolve,reject)=>{
      ytdl.downloadFromInfo(info,{
        format: highestvideo
      }).pipe(createWriteStream(videoTrackFile)).on('close',()=>{
        resolve(void 0)
      }).on('error',(err)=>{
        status.done(false,'Error Downloading Video Track',err as any)
        reject(err)
      })
    })
    status.updateStatus('Downloading Audio Track...')
    await new Promise((resolve,reject)=>{
      ytdl.downloadFromInfo(info,{
        format: highestaudio
      }).pipe(createWriteStream(audioTrackFile)).on('close',()=>{
        resolve(void 0)
      }).on('error',(err)=>{
        status.done(false,'Error Downloading Autio Track',err as any)
        reject(err)
      })
    })
    const cmd = `${ffmpeg} -y -i "${videoTrackFile}" -i "${audioTrackFile}" -c:v copy -map 0:v:0 -map 1:a:0 "${filename.replace(/\\/gui,'\\\\').replace(/"/gui,'\\"')}"`
    status.updateStatus('Merging...')
    exec(cmd,()=>{
      status.updateStatus('Removing Leftover Files...')
      unlinkSync(videoTrackFile)
      unlinkSync(audioTrackFile)
      status.updateStatus('Downloaded & Merged Successfully!','Your output is at '+filename)
      status.done(true)
    })
  }
})()