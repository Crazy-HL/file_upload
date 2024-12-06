//1. 导入 express
const express = require('express');
const path = require('path')
//导入multiparty模块，用于处理文件上传，特别是处理复杂的表单数据
const multiparty = require('multiparty')
//导入fs-extra模块，它是Node.js的文件系统模块的扩展，提供了更多便利的文件操作方法
const fse = require('fs-extra')
//导入cors模块，用于启用跨源资源共享（CORS），允许不同的域名访问你的API
const cors = require('cors')
//导入body-parser模块，用于解析HTTP请求体，支持多种格式，如json、raw、text、urlencoded等。
const bodyParser = require('body-parser')
//2. 创建应用对象
const app = express();

//使用body-parser中间件，将请求体解析为JSON格式。
app.use(bodyParser.json())
//使用cors中间件，允许跨源请求
app.use(cors())


const UPLOAD_DIR = path.resolve(__dirname,'uploads')//存放所有文件的文件夹路径
//提取文件后缀名
const extractExt = filename => {
  return filename.slice(filename.lastIndexOf('.'),filename.length)
}

//3. 创建路由规则
//上传接口
app.post('/upload',function(req,res){
  const form = new multiparty.Form()
  //调用form.parse方法来解析传入的请求（req）。这个方法接受三个参数：
      // err：如果解析过程中发生错误，这个参数将会是一个错误对象。
      // fields：一个对象，包含了表单中的所有非文件字段。
      // files：一个对象，包含了表单中上传的文件。
  form.parse(req,async function(err,fields,files){
    if(err){
      res.status(401).json({
        ok:false,
        msg:"上传失败，请重新上传"
      })
      return
    }
    // console.log("fields:",fields)
    // console.log("files:",files)
    const fileHash = fields['fileHash'][0]
    const chunkHash = fields['chunkHash'][0]

    //临时存放目录
    const chunkPath = path.resolve(UPLOAD_DIR,fileHash)
    //fse.existsSync用于检查一个路径在文件系统中是否存在
    if(!fse.existsSync(chunkPath)){
      await fse.mkdir(chunkPath)//fse.mkdir创建一个新目录
    }

    const oldPath = files['chunk'][0]['path']//切片当前的存放路径
    //将切片放入临时文件夹并以chunkHash命名
    await fse.move(oldPath,path.resolve(chunkPath,chunkHash))

    res.status(200).json({
      ok:true,
      msg:'上传成功'
    })
  })
})

//合并切片接口
app.post('/merge',async function(req,res){
  const {fileHash,fileName,size} = req.body
  // console.log(fileHash);
  // console.log(fileName);
  // console.log(size);

  //如果已经存在该文件，就无需合并
  const filePath = path.resolve(UPLOAD_DIR,fileHash + extractExt(fileName))//完整文件路径
  if(fse.existsSync(filePath)){
    res.status(200).json({
      ok:true,
      msg:'合并成功'
    })
    return
  }

  //执行合并
  const chunkDir = path.resolve(UPLOAD_DIR,fileHash)
  if(!fse.existsSync(chunkDir)){
    res.status(401).json({
      ok:false,
      msg:'合并失败，请重新上传！'
    })
    return
  }

  //合并操作
  //readdir: 这是fs-extra模块中的一个函数，用于读取一个目录的内容，返回目录中所有文件和子目录的名称数组。
  const chunkPaths = await fse.readdir(chunkDir)
  // console.log(chunkPath);

  //切片排序
  chunkPaths.sort((a,b)=>{
    return a.split('-')[1] - b.split('-')[1]
  })
  //读取写入操作
  const list = chunkPaths.map((chunkName,index)=>{
    return new Promise(resolve => {
      const chunkPath = path.resolve(chunkDir,chunkName)
      const readStream = fse.createReadStream(chunkPath)//创建一个可读流（read stream）来读取切片文件的内容
      const writeStream = fse.createWriteStream(filePath,{//创建一个可写流（write stream）来将读取的内容写入最终的文件filePath
        start:index * size,
        end:(index + 1) * size
      })
      readStream.on('end',async ()=>{//当读取流完成时，触发一个事件处理函数，该函数异步地删除已读取的切片文件
        await fse.unlink(chunkPath)
        resolve()
      })
      readStream.pipe(writeStream)//将读取流（read stream）的内容通过管道（pipe）传输到写入流（write stream）
    })
  })
  
  await Promise.all(list)
  //等所有切片合并后，删除文件夹
  await fse.remove(chunkDir)

  res.status(200).json({
    ok:true,
    msg:'合并成功'
  })
})

app.post('/verify',async function(req,res){
  const {fileHash,fileName} = req.body
  // console.log(fileHash);
  // console.log(fileName);

  const filePath = path.resolve(UPLOAD_DIR,fileHash + extractExt(fileName))

  //返回服务器上已经上传成功的切片
  const chunkDir = path.join(UPLOAD_DIR,fileHash)//path.join() 方法用于连接路径字符串
  let chunkPaths = []
  //如果存在对应的临时文件夹才读取
  if(fse.existsSync(chunkDir)){
    chunkPaths = await fse.readdir(chunkDir)
    console.log(chunkPaths);
  }

  if(fse.existsSync(filePath)){//如果存在，不用上传
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:false
      }
    })
  }else{
    res.status(200).json({//如果不存在，重新上传
      ok:true,
      data:{
        shouldUpload:true,
        existChunks:chunkPaths
      }
    })
  }
})

//4. 监听端口 启动服务
app.listen(3000, () =>{
  console.log('服务已经启动, 端口监听为 3000...');
  });
  