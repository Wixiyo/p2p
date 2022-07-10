import {
	Color,
	FileLoader,
	InstancedMeshEx,
	LoadingManager,
	Matrix4,
	MeshPhongMaterial,
	Object3D,
	Vector3,
	Vector4
} from './three/build/three';
import {GLTFLoaderEx} from './three/examples/jsm/loaders/GLTFLoaderEx.js';
import {DRACOLoader} from './three/examples/jsm/loaders/DRACOLoader';
import {ZipLoader} from './ziploader.js';
import {SLMSceneMeta} from './SLMSceneMeta.js';
import {Board} from './myThree/Board.js'

var SLMLoader = function(options)
{
	var scope = this;
	this.MaxColorIdStep = (options && options.MaxColorIdStep !== undefined) ? options.MaxColorIdStep : 40;
	this.EnablePicking = (options && options.EnablePicking !== undefined) ? options.EnablePicking : false;
	this.sceneMetas = [];
	this.totalElementCount = 0;
	this.pickingIdToSceneMeta = {};

	this.sceneTasks= [];
	this.GetTotalElementCount = function()
	{
		return this.totalElementCount;
	}

	this.AddScene = function(slmSceneMeta)
	{
		this.sceneMetas.push(slmSceneMeta);
		this.totalElementCount += slmSceneMeta.GetElementCount();
		for (var i = 0; i < slmSceneMeta.elementPickingIds.length; ++i)
		{
			this.pickingIdToSceneMeta[slmSceneMeta.elementPickingIds[i]] = this.sceneMetas[this.sceneMetas.length - 1];
		}
	}

	this.GetMetaFromPickingId = function(elementPickingId)
	{
		return this.pickingIdToSceneMeta[elementPickingId];
	}

	this.GetElementDesc = function(elementPickingId)
	{
		return this.pickingIdToSceneMeta[elementPickingId].GetElementDesc(elementPickingId);
	}

	this.GetElementMatrix = function(elementPickingId)
	{
		return this.pickingIdToSceneMeta[elementPickingId].GetElementMatrix(elementPickingId);
	}

	this.GetElementGroupMatrix = function(elementPickingId)
	{
		return this.pickingIdToSceneMeta[elementPickingId].GetElementGroupMatrix(elementPickingId);
	}

	this.GetElementBoundsCenter = function(elementPickingId)
	{
		var elemDesc = this.GetElementDesc(elementPickingId);
		var elementSrcId = elemDesc.sId;

		var meta = this.GetMetaFromPickingId(elementPickingId);
    	var center = new Vector3(meta.srcMeshGeoInfo[elementSrcId].c[0], meta.srcMeshGeoInfo[elementSrcId].c[1], meta.srcMeshGeoInfo[elementSrcId].c[2]);

    	center.applyMatrix4(this.GetElementMatrix(elementPickingId));

    	return center;
	}

	this.GetElementProperty = function(elementPickingId)
	{
		return this.pickingIdToSceneMeta[elementPickingId].GetElementProperty(elementPickingId);
	}

	// Geometry interaction
	this.RotateAroundPoint = function(elementPickingId, pointWoldPosition, axis, radian)
	{
		var mat0 = new Matrix4();
		mat0.multiply(this.GetElementMatrix(elementPickingId)).multiply(this.GetElementGroupMatrix(elementPickingId));

		var xAxis = axis.normalize();

		var trans0 = new Matrix4().makeTranslation(pointWoldPosition.x, pointWoldPosition.y, pointWoldPosition.z);
		var rot = new Matrix4().makeRotationAxis(xAxis, radian);
		var trans1 = new Matrix4().makeTranslation(-pointWoldPosition.x, -pointWoldPosition.y, -pointWoldPosition.z)

		var mat1 = new Matrix4();
		mat1.multiply(trans0).multiply(rot).multiply(trans1);

		var finalMat = new Matrix4();
		finalMat.multiply(mat1).multiply(mat0);

		var elemDesc = this.GetElementDesc(elementPickingId);
		elemDesc.mesh.setInstanceMatrixAt(elemDesc.gId, elemDesc.iId, finalMat);

		elemDesc.mesh.instanceMatrices[elemDesc.gId].needsUpdate = true;
	}

	this.RotateElement = function(elementPickingId, axis, radian)
	{
		var mat0 = new Matrix4();
		mat0.multiply(this.GetElementMatrix(elementPickingId)).multiply(this.GetElementGroupMatrix(elementPickingId));

		var center = this.GetElementBoundsCenter(elementPickingId);

		var xAxis = axis.normalize();

		var trans0 = new Matrix4().makeTranslation(center.x, center.y, center.z);
		var rot = new Matrix4().makeRotationAxis(xAxis, radian);
		var trans1 = new Matrix4().makeTranslation(-center.x, -center.y, -center.z)

		var mat1 = new Matrix4();
		mat1.multiply(trans0).multiply(rot).multiply(trans1);

		var finalMat = new Matrix4();
		finalMat.multiply(mat1).multiply(mat0);

		var elemDesc = this.GetElementDesc(elementPickingId);
		elemDesc.mesh.setInstanceMatrixAt(elemDesc.gId, elemDesc.iId, finalMat);

		elemDesc.mesh.instanceMatrices[elemDesc.gId].needsUpdate = true;
	}

	this.TranslateElement = function(elementPickingId, translation)
	{
		var mat0 = new Matrix4();
		mat0.multiply(this.GetElementMatrix(elementPickingId)).multiply(this.GetElementGroupMatrix(elementPickingId));

		var trans0 = new Matrix4().makeTranslation(translation.x, translation.y, translation.z);

		var mat1 = new Matrix4();
		mat1.multiply(trans0)

		var finalMat = new Matrix4();
		finalMat.multiply(mat1).multiply(mat0);

		var elemDesc = this.GetElementDesc(elementPickingId);
		elemDesc.mesh.setInstanceMatrixAt(elemDesc.gId, elemDesc.iId, finalMat);

		elemDesc.mesh.instanceMatrices[elemDesc.gId].needsUpdate = true;
	}

	this.EncodeElementPickingId = function(elementPickingId, isPicked)
	{
	  // Maximum count: 256 * 256 * 256 / 40
	  var idColor = new Color(elementPickingId * this.MaxColorIdStep);
	  return new Vector4(idColor.r, idColor.g , idColor.b, isPicked ? 1.0 : 0.0);
	}

	this.DecodeElementPickingId = function(pickedId)
	{
		return pickedId / this.MaxColorIdStep;
	}

	this.PushSceneTask = function(params)
	{
		this.sceneTasks.push(params);
	}

	this.BuildScene = function()
	{
		for (var i = 0 ; i < this.sceneTasks.length; ++i)
		{
			var sceneBuilder = new SLMSceneBuilder(this);
			sceneBuilder.BuildScene(this.sceneTasks[i]);
		}
	}

	this.LoadScene = function(scenes, singleSceneCallback, allScenesCallback, isSync)
	{
		function eachSceneCallback(slmScene, sceneTag)
		{
			if (singleSceneCallback)
			{
				singleSceneCallback(slmScene, sceneTag);
			}

			scope.multiSceneCounter++;

			if (scope.multiSceneCounter >= scope.multiScenes.length)
			{
				if (allScenesCallback)
				{
					allScenesCallback();
				}

				scope.BuildScene();
			}
		}

		var slmSceneParser
		if (Array.isArray(scenes))
		{
			this.multiScenes = scenes;
			this.multiSceneCounter = 0;

			for (var i = 0 ; i < scenes.length; ++i)
			{
				slmSceneParser = new SLMSceneParser(this);

				slmSceneParser.load(scenes[i], eachSceneCallback, '', isSync);
			}
		}
		else
		{
			this.multiScenes = [scenes];
			this.multiSceneCounter = 0;

			slmSceneParser = new SLMSceneParser(this);

			slmSceneParser.load(scenes, eachSceneCallback, '', isSync);
		}
	}
}
var SLMSceneBuilder = function(sceneMgr)
{
	var scope = this;

	this.sceneMgr = sceneMgr;

	function InstanceNode(gltfScene, iMatrix, structDesc, geoInfo, propInfo)
	{
		/*
		console.log("gltfScene", gltfScene)
		console.log("iMatrix", iMatrix)
		console.log("tructDesc", structDesc)
		console.log("geoInfo", geoInfo)
		console.log("propInfo", propInfo)
		*/

		var slmSceneMeta = new SLMSceneMeta(scope.sceneMgr, {geoInfo: geoInfo, propInfo: propInfo});
		scope.sceneMgr.AddScene(slmSceneMeta);//注释掉这句似乎对渲染效果没有影响

		var instanceMatrixMap = iMatrix;
		var structDescription = structDesc;

		var instanceRoot = new Object3D();//根对象，其它的解析后的实例化网格都会被添加到这里


		setTimeout(()=>new Board(),3000)

		gltfScene.add(instanceRoot);
		window.root1=instanceRoot
		var root2=new Object3D();
		root2.visible=false
		gltfScene.add(root2)
		window.root2=root2

		var rootGroupNode = gltfScene.children[0];
		//var meshNodeList = (gltfScene.children.length === structDescription.length) ? gltfScene.children : rootGroupNode.children;
		var isSelfContained = scope.sceneMgr.EnablePicking;//开始 //meshNodeList.length === structDescription.length

		//console.log("gltfScene",gltfScene)//console.log("gltfScene",gltfScene.children[0].children)
		var m1=gltfScene.children[0].children[0];//压缩包中的3D模型资源
		var m2=processMesh(m1,structDescription[0],slmSceneMeta,rootGroupNode.matrix,instanceMatrixMap,isSelfContained)
		instanceRoot.add(m2)// if (isSelfContained)
		myDelete(m1)//m1.visible = false;
		console.log(m2)

		/*if(root2){
			var newMaterial=[]
			for(i=0;i<m2.material.length;i++){
				var material=new MeshBasicMaterial({color:0})
				material.color.convertSRGBToLinear();
				newMaterial.push(material)
			}
			var m=m2.clone()
				m.material=newMaterial
			root2.add(m)
		}*/

		function myDelete(mesh) {
			if(mesh.parent)mesh.parent.remove(mesh)
			if(mesh.material)mesh.material.dispose()
			if(mesh.geometry)mesh.geometry.dispose()
		}
		window.loaded={}
		console.log('开始加载')
		/*var si0=setInterval(()=>{
			if(window.param.useP2P&&Object.values(window.p2p.myPeer.peers).length<1){
			}else{
				clearInterval(si0)
				start()
			}
		},100)*/
		start()
		//setTimeout(()=>{
		//},2000)
		//start()
		function start() {
			for(var i=0;i<window.sourceList.length;i++){
				var index=window.sourceList[i]
				loading(index,false,true)
			}
			console.log("开始加载外壳资源")
			// setTimeout(()=>{
				for(var i=0;i<window.sourceList2.length;i++){
					var index=window.sourceList2[i]
					loading(index,false)
				}
				console.log("开始加载视点资源")
			// },2500)
			// setTimeout(()=>{
				for(var i=0;i<window.sourceList3.length;i++){
					var index=window.sourceList3[i]
					loading(index,false)
				}
				console.log("开始加载漫游资源")
			// },5000)
			/*
			setTimeout(()=>{
				var prePoint=window.c.position.x+","+window.c.position.y+","+window.c.position.z
				var first=true
				setInterval(()=>{
					var point0=window.c.position.x+","+window.c.position.y+","+window.c.position.z
					if(prePoint===point0){
						if(first){
							window.updateSource()
							first=false
						}
					}else {
						prePoint=point0
						first=true
					}
				},100)
				console.log("开始动态加载资源资源")
			},10000)*/
		}


		window.updateSource=function () {
			var x=window.c.position.x
			var y=window.c.position.y
			var z=window.c.position.z
			var min=[-30,-23,-80],
				max=[334,17,35],
				step=[10,10,10];

			x=Math.floor((x-min[0])/step[0])*step[0]+min[0]
			y=Math.floor((y-min[1])/step[1])*step[1]+min[1]
			z=Math.floor((z-min[2])/step[2])*step[2]+min[2]

			if(x>max[0])x=max[0]
			if(y>max[1])y=max[1]
			if(z>max[2])z=max[2]

			if(x<min[0])x=min[0]
			if(y<min[1])y=min[1]
			if(z<min[2])z=min[2]


			var point=x+","+y+","+z
			var list=window.point_list[point]
			console.log("加载的为：",list.length)

			if(list)
			for(var i=0;i<list.length;i++)
				loading(list[i],false)
		}

		var branching=2;
		console.log("分支数目为：",branching)
		function loading(meshIndex,linkNext,high_quality) {//普通加载
			if(window.param.onlyP2P){
				window.p2p.needPack.enQueue(meshIndex)
				return
			}
			if(window.loaded[meshIndex])return;
			else window.loaded[meshIndex]=1;
			loadSubZip(addModel,
				meshIndex,
				linkNext,high_quality)
		}
		window.p2p.accept=(idData,array)=>{//p2p加载
			if(window.loaded[idData])return;
			else window.loaded[idData]=1;
			window.detection.add(idData,1)//1表示这个是通过P2P的方式接收到的
			//console.log("开始解析")
			new GLTFLoaderEx(new LoadingManager()).parse(
				array, "./",(gltf)=>{
					//console.log("用P2P解析成功！",gltf)
					addModel(gltf,idData,false)
				})
		}
		function addModel(gltf,meshIndex,linkNext,high_quality) {
			//if(meshIndex+1<structDescription.length) loading(meshIndex+1)//if(meshIndex+1<5000)loading(meshIndex+1)
			var group=gltf.scene.children[0];
			var myMeshEx1=group.children[0];//var name=myMeshEx1.name;
			instanceRoot.add(myMeshEx1)
			var myMeshEx2=processMesh(
				myMeshEx1,
				structDescription[meshIndex],
				//structDescription[parseInt(name)],
				slmSceneMeta,
				rootGroupNode.matrix,instanceMatrixMap,
				isSelfContained
			)
			if(high_quality){
				var newMaterial=[]
				if(meshIndex!==702)//702是一块玻璃
					for(i=0;i<myMeshEx2.material.length;i++){
						var material=//高光效果的材质
							new MeshPhongMaterial({
								color:myMeshEx2.material[i].color,
								specular:0xffaaaa,//镜面反射
								shininess:30 //光亮
							});//材质对象
						newMaterial.push(material)
					}
				else console.log("702",myMeshEx2.material)
				myMeshEx2.material=newMaterial
			}

			instanceRoot.add(myMeshEx2)
			//用于去除删除，开始
			myMeshEx2.meshIndex=meshIndex
			if(!window.meshes)window.meshes=[]
			else window.meshes.push(myMeshEx2)
			//用于去除删除，结束
			myDelete(myMeshEx1)//myMeshEx1.visible = false;//console.log(myMeshEx1.parent)

			var countAll=structDescription.length
			if(linkNext)
				for(var i=branching*(meshIndex-1)+2;i<=branching*meshIndex+1;i++)
					if(i<countAll)loading(i,true)
					else if(i===(countAll-1)*branching){
						console.log("加载时间为："+ ((performance.now()-window.time0)/1000)+"秒")
						return;
					}
		}
		//完成
	}
	function processMesh(//对自定义的MeshEx对象逐个处理
		node,//MeshEx
		groupStruct,//个数对应材质, groupStruct的长度受到gltf文件的影响
		slmSceneMeta,
		parentMatrix,//父节点的世界变换矩阵
		instanceMatrixMap,//个数对应形状
		isSelfContained//实例化对象是否包含原本的个体
	){
		//console.log("node:",node)
		/*var array=node.geometry.attributes.normal.array
		if(array instanceof Float32Array){
			//node.geometry.attributes.normal.array=
			//node.geometry.attributes.normal.data=
				//new Int8Array(array.buffer);
			var arr=[];//new Float32Array(array.length*3)
			for(i=0;i<3;i++)
				for(var j=0;j<array.length;j++)
					arr.push(array.buffer[j])
			node.geometry.attributes.normal.array=
				new Int8Array(arr)
		}
		window.array=array*/
		var groups = [];
		var instanceCountList = [];
		var materialList = [];
		var clonedMaterial = node.material.clone();

		//console.log("groupStruct.length:"+groupStruct.length)
		//console.log('instanceMatrixMap',instanceMatrixMap)
		for (var i = 0; i < groupStruct.length ; ++i)
		{//groupStruct对应材质的个数
			var instanceCount = instanceMatrixMap[groupStruct[i].n].it.length + (isSelfContained ? 1 : 0);
			instanceCountList.push(instanceCount);
			materialList.push(clonedMaterial);
			groups.push({//每组一个材质,groups的长度受到gltf文件的影响
				start: groupStruct[i].s,
				count: groupStruct[i].c,
				instanceCount: instanceCount,
				name: groupStruct[i].n
			})
		}
		var instancedMesh = new InstancedMeshEx(node.geometry, materialList, 1, instanceCountList);
		//自定义的用于实例化的对象
		instancedMesh.geometry.clearGroups();
		var instanceCounter = 0;
		for (var groupIndex = 0; groupIndex < groups.length ; ++groupIndex)
		{
			var group = groups[groupIndex];
			var instance = instanceMatrixMap[group.name].it;
			var instancedElemIds = instanceMatrixMap[group.name].id;
			//if (instance.length > 0)//如果是采用了实例化的对象
			{//将网格添加到场景中
				instanceCounter++;
				instancedMesh.geometry.addGroupInstanced(group.start * 3, group.count * 3, groupIndex, groupIndex);

				var totalInstanceLength = instance.length + (isSelfContained ? 1 : 0);
				for (var subInstanceIndex = 0; subInstanceIndex < totalInstanceLength; subInstanceIndex++)
				{
					var mat4 = null;
					var backupMat = new Matrix4();

					var elementId = 0;
					var instanceMatrix = new Matrix4();
					if (isSelfContained && subInstanceIndex === instance.length)
					{
						mat4 = instanceMatrix.multiply(parentMatrix);
						// Source element
						elementId = parseInt(group.name);
					} else {
						var mat = instance[subInstanceIndex];
						instanceMatrix.set(
							mat[0], mat[1], mat[2], mat[3],
							mat[4], mat[5], mat[6], mat[7],
							mat[8], mat[9], mat[10], mat[11],
							0, 0, 0, 1);
						backupMat.set(
							mat[0], mat[1], mat[2], mat[3],
							mat[4], mat[5], mat[6], mat[7],
							mat[8], mat[9], mat[10], mat[11],
							0, 0, 0, 1);
						mat4 = instanceMatrix.multiply(parentMatrix);
						// Instanced element
						elementId = instancedElemIds[subInstanceIndex];//每个矩阵的编号
					}

					instancedMesh.setInstanceMatrixAt(groupIndex, subInstanceIndex, mat4);

					slmSceneMeta.SetElementDesc(elementId, {mesh: instancedMesh, gId: groupIndex, iId: subInstanceIndex, sId: group.name});
					slmSceneMeta.SetElementMatrix(elementId, backupMat.clone());
					slmSceneMeta.SetElementGroupMatrix(elementId, parentMatrix.clone());
				}

			}
		}
		if (instanceCounter > 0)//如果实例化个数不为0则返回对象  这里基本上一定会被执行
		{
			return instancedMesh;//instanceRoot.add(instancedMesh);//instancedMesh是重构后的网格
		}
	}//完成mesh处理

	this.BuildScene= function(task)//SLMSceneBuilder下
	{
		console.log("task",task)
		InstanceNode(task.gltfScene, task.iMatrix, task.structDesc, task.geoInfo, task.propInfo);
	}
}
function SLMSceneParser(sceneMgr)
{
	var scope = this;
	this.sceneMgr = sceneMgr;
	this.finishCallback = null;
	var loadingManager = new LoadingManager();
	loadingManager.setURLModifier((url, path) =>
	{
		return (path || '') + url;
	});
	loadingManager.onProgress = function ( url, itemsLoaded, itemsTotal )
	{
		//console.log( 'Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
	};
	function loadJsonList(targetScene, urls, mananger, callback)
	{
		var dataList = [];
		var counter = 0;
		var urlList = urls;
		function addLoad(data)
		{
			dataList.push(data);
			counter++;
			//console.log(data);
			if (counter < urlList.length)
			{
				loadUrl(urlList[counter], loadingManager);
			}
			else
			{
				if (callback)
					callback(targetScene, dataList);
			}
		}
		function loadUrl(url, manager)
		{
			if (url)
			{
				var loader = new FileLoader(manager);
				loader.load(url , function(data)
				{
					addLoad(JSON.parse(data));
				}, null, function()
				{
				addLoad(null);
				});
			}
			else
			{
				addLoad(null);
			}
		}

		loadUrl(urlList[counter], loadingManager);
	}
    function loadScene(configJson)
	{
		const loader = new GLTFLoaderEx(loadingManager);
		loader.setCrossOrigin('anonymous');
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath( 'lib/draco/' );
		//loader.setDRACOLoader( dracoLoader );
		const blobURLs = [];
		loader.load(configJson.fileUrl, (gltf) => {//解析模型资源
			const scene = gltf.scene || gltf.scenes[0];
			scene.rotation.set(3*Math.PI/2,0,0)
			blobURLs.forEach(URL.revokeObjectURL);//此句被注释对程序无影响 //这里blobURLs貌似就是一个空数组
			if (configJson.matrixDesc && configJson.structDesc)
			{
				loadJsonList(scene, [configJson.matrixDesc, configJson.structDesc, configJson.geoInfo, configJson.propInfo], loadingManager, function(targetScene, dataList)
				{
					//only(0)
					function only(k){
						window.structdesc=dataList[1];
						targetScene.children[0].children=[targetScene.children[0].children[k]]
						dataList[1]=[dataList[1][k]]
					}
					scope.sceneMgr.PushSceneTask(
						{
							gltfScene: targetScene,
							iMatrix: dataList[0],
							structDesc: dataList[1],
							geoInfo: dataList[2],
							propInfo: dataList[3]
						}
					);
					if (scope.finishCallback)
						scope.finishCallback(scene, scope.sceneTag);
				});
			}
		},
		function(xhr) {}, null);
	}

	this.load = function(url, finishCallback, sceneTag)
	{
		this.finishCallback = finishCallback;
		this.sceneTag = sceneTag;
		return new Promise((resolve, reject) => {
			if (url.toLowerCase().endsWith('.zip'))
			{
				new Promise( function( resolve, reject ) {
					if ( url.match( /\.zip$/ ) ) {//如果url里面有“.zip”字段
						//加载资源压缩包
						new ZipLoader().load( url , function ( xhr )
						{//updateProgressBar(( xhr.loaded / xhr.total * 100 ).toFixed(1), 'loading...');
						}).then( function( zip )//解析压缩包
						{
							loadingManager.setURLModifier( zip.urlResolver );
							var geoInfos = zip.find('geoinfo.json');//几何信息
							var propInfos = zip.find('properties.json');//资源信息

							resolve({//查看文件是否存在？以及路径
								fileUrl: zip.find( /\.(gltf|glb)$/i )[0],
								matrixDesc: zip.find('smatrix.json')[0],
								structDesc: zip.find('structdesc.json')[0],
								geoInfo: geoInfos.length > 0 ? geoInfos[0]:null,
								propInfo: propInfos.length > 0 ? propInfos[0]:null
							});
						} );

					} else
					{
						resolve( url );
					}
				} ).then( function ( configJson )
				{
					loadScene({
						fileUrl: configJson.fileUrl,
						matrixDesc: configJson.matrixDesc,
						structDesc: configJson.structDesc,
						geoInfo: configJson.geoInfo,
						propInfo: configJson.propInfo,
						isFromZip: true});

					/*
					fileUrl: "blob:./output.glb"
					geoInfo: "blob:./geoinfo.json"
					isFromZip: true
					matrixDesc: "blob:./smatrix.json"
					propInfo: null
					structDesc: "blob:./structdesc.json"
					*/
				} );
			}
			else
			{
				loadScene({fileUrl: url});
			}
		});
	}
}
function loadSubZip (back,meshIndex,linkNext,high_quality) {//assets\models\SAM_Review_1\output1.zip
	var projectName=window.param.projectName;//"JinYue"
	var url="assets/models/"+projectName+"/output"+meshIndex+".zip"
	var loader=new LoadingManager()
	new Promise( function( resolve, reject ) {
		//加载资源压缩包
		new ZipLoader().load( url,()=>{
		},()=>{
			console.log("加载失败："+meshIndex)
			window.loaded[meshIndex]=false;
			setTimeout(()=>{//重新请求
				if(window.param.onlyP2P)
					return
				if(window.loaded[meshIndex])return;
				else window.loaded[meshIndex]=1;
				loadSubZip (back,meshIndex,linkNext,high_quality)
			},1000*(0.5*Math.random()+1))//1~1.5秒后重新加载
		}).then( ( zip )=>{//解析压缩包
			loader.setURLModifier( zip.urlResolver );//装载资源
			resolve({//查看文件是否存在？以及路径
				fileUrl: zip.find( /\.(gltf|glb)$/i )[0]
			});
		});
	} ).then( function ( configJson ) {
		/*new GLTFLoaderEx(loader).load(configJson.fileUrl, (gltf) => {//解析模型资源
			if(back)back(gltf)
		});*/
		var myGLTFLoaderEx=new GLTFLoaderEx(loader)
		myGLTFLoaderEx.load(configJson.fileUrl, (gltf) => {
			try{
				//console.log(window.p2p)
				
				window.p2p.send({
					type:"data",
					idData:meshIndex,
					array:myGLTFLoaderEx.myArray,
				})
				/**/
				window.p2p.store(
					meshIndex,
					myGLTFLoaderEx.myArray
				)
			}catch (e) {
				console.log('转发失败',e)
			}
			window.detection.add(meshIndex,0)//0表示通过服务器的方式获取的
			myGLTFLoaderEx.parse( myGLTFLoaderEx.myArray, "./",(gltf)=>{
				if(back)back(gltf,meshIndex,linkNext,high_quality)
			})
		});

	} );
}

export { SLMLoader }
