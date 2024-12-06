# **上传文件**

## 读取文件

通过监听`input`的`change`事件，当选取了本地文件后，可以在回调函数中拿到对应的文件

```ts
const handleUpload = (e: Event) => {
  //通过使用 (e.target as HTMLInputElement)，你告诉TypeScript编译器，e.target 是一个 HTMLInputElement 类型的元素
  // console.log((e.target as HTMLInputElement).files);

  //读取文件
  const files = (e.target as HTMLInputElement).files;
  if (!files) return;
  console.log(files[0]);
 };
```

## 文件分片

`Blob`（Binary Large Object的缩写）是JavaScript中的一个对象，代表了一种可以存储大量二进制数据的不可变对象。

文件分片的核心是用**Blob对象**的**slice方法**，我们在上一步获取到的文件是一个**File**对象，它是继承于Blob对象，所以可以用slice方法对File对象的文件进行分片，用法如下：

``let blob = instanceOfBlob.slice([start[,end[,contentType]]])``

start 和end代表**Blob**里的下标，表示被拷贝进新的Blob的字节的起始位置和结束位置。contentType会给新的Blob赋予一个新的文档类型，在这里我们用不到。接下来使用slice方法来实现文件分片。

```ts
//1MB = 1024KB = 1024*1024 B
const CHUNK_SIZE = 1024 * 1024; //1M
const createChunks = (file: File) => {
    let cur = 0;
    let chunks = [];
    while (cur < file.size) {
        const blob = file.slice(cur, cur + CHUNK_SIZE);
        chunks.push(blob);
        cur += CHUNK_SIZE; //CHUNK_SIZE是分片的大小
    }
    return chunks;
};
```

### hash计算

在向服务器上传文件时，一般使用hash值去区分不同的文件，文件内容不同，**hash值**也会不同。

如何计算hash值？通过一个工具：``spark-md5``，所以需要先安装它。

在上一步获取了文件的所有切片，我们就可以用这些切片来计算文件的hash值，但是如果一个文件特别大，每个切片的所有内容都参与计算的话会很耗时间，所以我们采取以下策略：

1. 第一个和最后一个切片的内容全部参与计算
2. 中间剩余的切片分别在前面、后面和中间取2个字节参与计算

这样既保证了所有的切片都参与计算，又减少了时间消耗。

```ts
	//hash计算
	const calculateHash = (chunks: Blob[]) => {
		//1. 第一个和最后一个切片的内容全部参与计算
		//2. 中间剩余的切片分别在前面、后面和中间取2个字节参与计算
		const targets: Blob[] = []; //存储所有参与计算的切片
		const spark = new SparkMD5.ArrayBuffer();//创建一个 SparkMD5 实例，专门用于处理 ArrayBuffer 类型的数据
		const fileReader = new FileReader();//创建一个新的 FileReader 实例
		chunks.forEach((chunk, index) => {
			if (index === 0 || index === chunks.length - 1) {
				targets.push(chunk);
			} else {
				targets.push(chunk.slice(0, 2)); //前两个字节
				targets.push(chunk.slice(CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2)); //中间两个字节
				targets.push(chunk.slice(CHUNK_SIZE - 2, CHUNK_SIZE)); //最后两个字节
			}
		});

		//计算hash值
		fileReader.readAsArrayBuffer(new Blob(targets));//使用 FileReader 的 readAsArrayBuffer 方法读取一个 Blob 对象，这个 Blob 对象是由 targets 数组创建的
		//设置 FileReader 的 onload 事件处理函数，当读取操作完成时，这个函数会被调用
		fileReader.onload = e => {
			spark.append((e.target as FileReader).result);// 类型断言确保 e.target 可以作为 FileReader 处理
			console.log("hash: " + spark.end());// 计算并打印 MD5 哈希值
		};
	};
```

但是，onload函数是异步的，只有在FileReader读取完成之后才会触发，但是我们需要同步获取hash值，因为在后面我们还需要去使用，所以需要把计算hash值的方法改成异步函数，并在使用该函数的时候用await语法糖。

```ts
import SparkMD5 from "spark-md5";
//1MB = 1024KB = 1024*1024 B
const CHUNK_SIZE = 1024 * 1024; //1M
const handleUpload = async (e: Event) => {
    //读取文件
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    console.log(files[0]);

    //文件分片
    const chunks = createChunks(files[0]);
    console.log(chunks);

    //hash计算
    const hash = await calculateHash(chunks);
};

//文件分片
const createChunks = (file: File) => {
    let cur = 0;
    let chunks = [];
    while (cur < file.size) {
        const blob = file.slice(cur, cur + CHUNK_SIZE);
        chunks.push(blob);
        cur += CHUNK_SIZE;
    }
    return chunks;
};

//hash计算
const calculateHash = (chunks: Blob[]) => {
    //返回一个Promise对象
    return new Promise(resolve => {
        //1. 第一个和最后一个切片的内容全部参与计算
        //2. 中间剩余的切片分别在前面、后面和中间取2个字节参与计算
        const targets: Blob[] = []; //存储所有参与计算的切片
        const spark = new SparkMD5.ArrayBuffer(); //创建一个 SparkMD5 实例，专门用于处理 ArrayBuffer 类型的数据
        const fileReader = new FileReader(); //创建一个新的 FileReader 实例
        chunks.forEach((chunk, index) => {
            if (index === 0 || index === chunks.length - 1) {
                targets.push(chunk);
            } else {
                targets.push(chunk.slice(0, 2)); //前两个字节
                targets.push(chunk.slice(CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2)); //中间两个字节
                targets.push(chunk.slice(CHUNK_SIZE - 2, CHUNK_SIZE)); //最后两个字节
            }
        });

        //计算 hash值
        fileReader.readAsArrayBuffer(new Blob(targets)); //使用 FileReader 的 readAsArrayBuffer 方法读取一个 Blob 对象，这个 Blob 对象是由 targets 数组创建的
        //设置 FileReader 的 onload 事件处理函数，当读取操作完成时，这个函数会被调用
        fileReader.onload = e => {
            spark.append((e.target as FileReader).result); // 类型断言确保 e.target 可以作为 FileReader 处理
            // console.log("hash: " + spark.end()); // 计算并打印 MD5 哈希值
            resolve(spark.end());
        };
    });
};
```

### 上传分片

#### 前端实现

因为浏览器有并发限制，例如chrome浏览器默认并发数量是6，所以我们需要限制前端请求个数。也就是说，我们要创建最大并发数的请求，例如同一时刻只允许浏览器发送6个请求，其中一个请求有了返回结果后再发起一个新的请求，以此类推，直至所有的请求发送完毕。

上传文件时一般还要用到``FormData``对象，需要将我们要传递的文件还有额外信息放到这个``FormData``对象里面。

```ts
//上传分片
const uploadChunks = async (chunks: Blob[]) => {
    const data = chunks.map((chunk, index) => {
        return {
            fileHash: fileHash.value,
            chunkHash: fileHash.value + "-" + index,
            chunk
        };
    });

    //把data转成formData对象
    const formDatas = data.map(item => {
        const formData = new FormData();
        formData.append("fileHash", item.fileHash);
        formData.append("chunkHash", item.chunkHash);
        formData.append("chunk", item.chunk);
        return formData;
    });
    // console.log(formDatas);

    const max = 6; //最大并发请求数
    let index = 0;
    const taskPool: any = []; //请求池
    //为每个FormData对象创建一个fetch请求
    while (index < formDatas.length) {
        const task = fetch("http://localhost:3000/upload", {
            method: "POST",
            body: formDatas[index]
        });

        //使用splice方法移除taskPool中已经完成的任务，然后使用push方法将新的任务添加到taskPool中
        taskPool.splice(
            taskPool.findIndex((item: any) => item === task),
            1
        );
        taskPool.push(task);
        if (taskPool.length === max) {
            await Promise.race(taskPool);
        }
        index++;
    }
    await Promise.all(taskPool);
};
```

#### 后端实现

后端处理文件时需要用到``multiparty``这个工具，所以需要先安装它再引入。

在处理每个上传的分片时，需要先将它们临时存放到服务器的一个地方，方便合并时再读取。为了区分不同文件的分片，用文件对应的hash值作为文件夹的名称，再将这个文件的所有分片放到这个文件夹中。

```js
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

//3. 创建路由规则
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

//4. 监听端口 启动服务
app.listen(3000, () =>{
  console.log('服务已经启动, 端口监听为 3000...');
  });
  
```

## 分片合并

#### 前端实现

前端只需要向服务器发送一个合并的请求，并且为了区分要合并的文件，需要将文件的hash值给传过去。

```ts
const mergeRequest = () => {
		fetch("http://localhost:3000/merge", {
			method: "POST",
			headers: {
				"Content-type": "application/json"
			},
			body: JSON.stringify({
				fileHash: fileHash.value,
				fileName: fileName.value,
				size: CHUNK_SIZE
			})
		}).then(res => {
			alert("合并成功！");
		});
	};
```

#### 后端实现

```js
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
  chunkPaths.map((chunkName,index)=>{
    const chunkPath = path.resolve(chunkDir,chunkName)
    const readStream = fse.createReadStream(chunkPath)//创建一个可读流（read stream）来读取切片文件的内容
    const writeStream = fse.createWriteStream(filePath,{//创建一个可写流（write stream）来将读取的内容写入最终的文件filePath
      start:index * size,
      end:(index + 1) * size
    })
    readStream.on('end',async ()=>{//当读取流完成时，触发一个事件处理函数，该函数异步地删除已读取的切片文件
      await fse.unlink(chunkPath)
    })
    readStream.pipe(writeStream)//将读取流（read stream）的内容通过管道（pipe）传输到写入流（write stream）
  })

  res.status(200).json({
    ok:true,
    msg:'合并成功'
  })
})

```

因为文件读取和写入的操作是异步的，也就是后面代码不会等待前面代码完成后再执行，也就无法在后面代码中判断前面的文件读取和写入操作是否完成，因此需要使整个读取写入函数返回promise对象，方便监听每个读取写入的完成状态的改变。用`Promise.all(list)`监听，待切片合并完成也就是文件读写完成后，删除文件夹`fse.remove(chunkDir)`。

```js
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
```

## 秒传

因为在服务器上给上传的文件命名的时候，是用对应的hash值命名的，而内容相同的文件对应的hash值是一样的。所以可以在上传前加一个判断，如果有对应的文件，就不需要重复上传，直接提示上传成功，也就是实现了秒传。

#### 前端实现

前端在上传之前，需要将对应文件的hash值告诉服务器，看看服务器上有没有对应的文件，如果有，就直接返回，不执行上传操作。

```js
	const handleUpload = async (e: Event) => {
		//读取文件
		const files = (e.target as HTMLInputElement).files;
		if (!files) return;
		// console.log(files[0]);

		//文件分片
		const chunks = createChunks(files[0]);
		// console.log(chunks);

		//hash计算
		const hash = await calculateHash(chunks);
		// console.log("myhash:", hash);

		fileHash.value = hash as string;
		fileName.value = files[0].name;

		//校验hash值
		const data = await verify();
		// console.log(data.data.shouldUpload);
		if (!data.data.shouldUpload) {
			alert("秒传：上传成功");
			return;
		}

		//上传分片
		uploadChunks(chunks);
	};
		//校验hash值
	const verify = () => {
		return fetch("http://localhost:3000/verify", {
			method: "POST",
			headers: {
				"Content-type": "application/json"
			},
			body: JSON.stringify({
				fileHash: fileHash.value,
				fileName: fileName.value
			})
		})
			.then(res => res.json())
			.then(res => {
				return res;
			});
	};
```

#### 后端实现

```js
app.post('/verify',function(req,res){
  const {fileHash,fileName} = req.body
  // console.log(fileHash);
  // console.log(fileName);

  const filePath = path.resolve(UPLOAD_DIR,fileHash + extractExt(fileName))
  if(fse.existsSync(filePath)){//如果存在，不用上传
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:false
      }
    })
  }else{
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:true
      }
    })
  }
})
```

## 断点续传

上面解决了重复上传的文件，但是对于网络中断需要重新上传的问题没有解决，应该如何解决呢？

如果之前我们已经上传了一部分分片，我们只需要在上传之前拿到这部分分片，然后再过滤重复上传的分片，所以上传之前只需要再加一个判断。

#### 前端实现

还是在`verify`的接口中获取已经上传成功的分片，然后在上传分片之前进行一个过滤。

```js
const handleUpload = async (e: Event) => {
    //读取文件
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    // console.log(files[0]);

    //文件分片
    const chunks = createChunks(files[0]);
    // console.log(chunks);

    //hash计算
    const hash = await calculateHash(chunks);
    // console.log("myhash:", hash);

    fileHash.value = hash as string;
    fileName.value = files[0].name;

    //校验hash值
    const data = await verify();
    // console.log(data.data.shouldUpload);
    if (!data.data.shouldUpload) {
        alert("秒传：上传成功");
        return;
    }

    //上传分片
    uploadChunks(chunks, data.data.existChunks);
};

```

#### 后端实现

```js
app.post('/verify',async function(req,res){
  const {fileHash,fileName} = req.body
  const filePath = path.resolve(UPLOAD_DIR,fileHash + extractExt(fileName))

  //返回服务器上已经上传成功的切片
  const chunkDir = path.join(UPLOAD_DIR,fileHash)//path.join() 方法用于连接路径字符串
  let chunkPaths = []
  //如果存在对应的临时文件夹才读取
  if(fse.existsSync(chunkDir)){
    chunkPaths = await fse.readdir(chunkDir)
    console.log(chunkPaths);
  }
......
})
//上传分片
const uploadChunks = async (chunks: Blob[], existChunks: string[]) => {
......
    //把data转成formData对象
    const formDatas = data
        //过滤已经存在的切片
        .filter(item => !existChunks.includes(item.chunkHash))
        .map(item => {
            const formData = new FormData();
            formData.append("fileHash", item.fileHash);
            formData.append("chunkHash", item.chunkHash);
            formData.append("chunk", item.chunk);
            return formData;
        });

 ......
};
```

