class RequestSet{
    constructor(){
      this.size = 0;
      this.items = {};//用来存储元素。
      this.index = -1
      this.array = []
    }
    put(e){
        this.size++;
        this.items[e] = e
    }
    forward(){
        if(this.index >= this.array.length || this.index == -1){
            this.active()
        }
        var id = this.array[this.index]
        this.index++
        
		return id
    }
    active(){
        this.index = 0
        this.array = Object.keys(this.items)
    }
    poll(e){
        this.size--
        delete this.items[e]
    }    
  }

export {P2P}
import {Peer} from "./Peer.js";
//经过测试：
//      1个发送方多个接收方没有问题，但是多个发送方似乎会有问题
class P2P{
    //sceneName=JinYue&useP2P=false&roomNumber=1;
    constructor(){//每个房间的人数最好不要超过10个
        this.useP2P= window.param.useP2P
        console.log('执行了P2P的代码',this.useP2P)
        if(!this.useP2P)return
        this.warehouse= {}//已有的数据
        this.needPack=new RequestSet()//需要的数据包编号，这个存储结构使用集合
        this.handedQuest = false
        this.bestPeer = {
            id:0,
            packnum:0,
            delay:999999
        }
        //this.needPack=new Queue(5000)

        this.myPeer=new Peer({socketURL:window.param.socketURL})
        //alert(window.param.socketURL)
        //this.myPeer=new Peer({socketURL:"http://101.34.166.68:8888/"})
        this.myPeer.receive=this.receive0
        this.accept=null
        this.data_buffer = {}
        if(window.param.onlyP2P){
            this.detect()
        }
    }
    detect(){
        var work = setInterval(()=>{
            console.log('检测中')
            this.updatePeer()
            if(this.bestPeer.id!=0&&this.needPack.size>0){
                this.request()
                clearInterval(work)
            }
        },10)
    }
    test(){
        var scope=this
        this.testID=0
        setInterval(()=>{
            var id = Object.keys(scope.warehouse)[scope.testID]
            var array = Object.values(scope.warehouse)[scope.testID]
            scope.testID++
            if(scope.testID>=Object.values(scope.warehouse).length)scope.testID=0
            scope.send({
                type:"data",
                idData:id,
                array:array
            })
            console.log(Object.values(scope.warehouse).length,scope.testID)
        })
    }

    updatePeer(){
        for(var i in this.myPeer.peers){
            if(this.myPeer.peers[i].readyState==='open'){
                this.send({
                    type:"signaling",
                    start:performance.now()
                })
            }
        }
    }

    request(){
        if(!this.useP2P)return
        if(window.loaded[idData]) return//如果该数据包已经被加载
        if(this.needPack.size>0){
            var idData = this.needPack.forward()
            // console.log(idData)
            this.send({
                type:"request",
                idData:idData
            },this.bestPeer.id)
        }
        }
        

    store(idData,array){//存储数据
        this.request()
        this.needPack.poll(idData)
        if(!this.useP2P)return
        if(array){
            this.warehouse[idData]=array
            //console.log('已经收到的数据包个数为:',Object.values(this.warehouse).length)
            /*this.send({//将收到的数据进行广播
                type:"data",
                idData:idData,
                array:array,
            })
            */
        }
    }

    send(data,target){
        if(!this.useP2P)return
        /*{
			type:"data",
			idData:meshIndex,
			array:myGLTFLoaderEx.myArray,
		}*/
        this.myPeer.send(JSON.stringify(data),target)
    }
    receive0(event,sourceId){
        var scope=window.p2p//就是this
        var pack=JSON.parse(event.data)
        if(pack.type&&pack.type==='text'){
            pack=JSON.parse(pack.message)
        }
        //console.log('收到：', pack)
        console.log('收到：', pack,sourceId,scope.warehouse[pack.idData])
        if(scope.accept){
            try{
                switch(pack.type)
                {
                case 'data':
                    //console.log('收到P2P数据')
                    scope.store(pack.idData,pack.array)
                    scope.accept(pack.idData,pack.array)
                    break
                case 'part_data'://接收切分的包并组装
                    scope.onPartData(pack)
                    break
                case 'signaling':
                    scope.onSignalingMessage(pack,sourceId)
                    break
                case 'request':
                    scope.onRequestMessage(pack,sourceId)
                    break
                case 'test':
                    console.log(pack.test)
                    break
                default:
                }
            }catch(e){
                console.log('p2p数据包解析错误：',e)
            }

        }

    }

    onSignalingMessage(pack,sourceId){
        console.log('onSignalingMessage')
        console.log(pack)
        if(!pack.packnum){
            this.send({
            type:"signaling",
            mid:performance.now(),
            formerdelay:performance.now()-pack.start,
            packnum:Object.keys(this.warehouse).length
            },sourceId)
        }
        else{
            if(pack.packnum>this.bestPeer.packnum){
                this.bestPeer.id = sourceId
            }
        }
    }
    onPartData(pack){
        var data_buffer = window.p2p.data_buffer
        if(!data_buffer[pack.idData]){
            data_buffer[pack.idData] = new Array()
        }
        data_buffer[pack.idData][pack.idPart] = pack.array
        if(Object.keys(data_buffer[pack.idData]).length == pack.Dlength){
            var arr = []
            data_buffer[pack.idData].forEach(item => {
                arr.push.apply(arr,item)
            })
            this.store(pack.idData,arr)
            this.accept(pack.idData,arr)
            delete data_buffer[pack.idData]
        }
    }
    onRequestMessage = function(pack,sourceId){
        if(this.warehouse[pack.idData]){
            var model_data = this.warehouse[pack.idData]//进行大包的切分
            var part_size = 5400
            if(model_data.length>part_size){
                // console.log('过大包拆分')
                var parts_data = sliceIntoChunks(model_data,part_size)
                for (var i = 0; i<parts_data.length; i++){
                    this.send({
                        type:"part_data",
                        idData:pack.idData,
                        idPart:i,
                        Dlength:parts_data.length,
                        array:parts_data[i]
                        },sourceId)
                }
            }
            else{
                // console.log('正常包直接发')
                this.send({
                type:"data",
                idData:pack.idData,
                array:this.warehouse[pack.idData]
                },sourceId)
            }
        }
    }
}

function sliceIntoChunks(arr, chunkSize) {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}