class Peer{//对 _Peer 对象进行封装
    constructor(opt) {
        var scope=this
        var _myPeer=new _Peer(opt)
        var waitingUser=[]
        this.peers=_myPeer.peers
        this.getPrint=()=>{
            var print=_myPeer.print
            print.p2pConn = Object.keys(window.p2p.myPeer.peers).length
            return print
        }
        this.send=(data,target)=>{
            
            //console.log('发送',data)
            if(typeof target==="undefined")
                for(var i in _myPeer.peers){
                    if(_myPeer.peers[i].readyState==='open'){
                        // if(_myPeer.peers[i].bufferedAmount+data.length>43690*300){
                        //     console.log('缓存不足')
                        // }else{
                        //     // console.log('缓存充足',data.length)
                        //     // if(data &&
                        //     //     typeof data.length!=="undefined"){
                        //     //     if(data.length>43690){
                        //     //         console.log('发给',target,'的数据包过大')
                        //     //     }
                        //     // }
                            _myPeer.peers[i].send(data)
                        // }
                    }else console.log("无法通信："+i)
                }
            else if(_myPeer.peers[target])
                _myPeer.peers[target].send(data)
            else
                console.log("target does not exist")
        }
        this.receive=(message,sourceId)=> {
            /*var data=JSON.parse(message.data)
            if(data.type==='timeStamp'){
                var reply={
                    type:'timeStamp_reply',
                    time:data.time
                }
                this.send(JSON.stringify(reply),sourceId)
            }else if(data.type==='timeStamp_reply'){
                var delay=performance.now()-data.time
                _myPeer.peers[sourceId].delay=delay
                console.log('delay of '+sourceId+' is '+delay)
            }*/
        }
        //this.connect=id=>_myPeer.connect(id)
        //以下是重新函数
        _myPeer.finish=()=>{
            // if(waitingUser.length>0){
            //     _myPeer.connect(waitingUser.splice(0,1)[0])
            // }
            //waitingUser.push(idOther)
        }
        _myPeer.openCallback=id=>{
            // _myPeer.showOther(id,'已连接')
            _myPeer.peers[id].onmessage=(data)=>{
                // var msg = document.createElement('b')
                // msg.innerHTML = '<b id="state">'+data.data+'&emsp;</b>'
                // document.getElementById(id).appendChild(msg)
                scope.receive(data,id)
            }
            var data={type:'timeStamp',time:performance.now()}
            _myPeer.peers[id].send(
                JSON.stringify(data)
            )
        }
        //以下是添加函数
        //_myPeer.
    }
}
class _Peer{
    constructor(opt) {
        this.print={

            version:'mix',
            onopen:[],
            onclose:[],//id,state,buffer,time
            first_channel_onopen_time:-1,
            onDataChannelCreated:[]
        }//用于detection对象
        this.myId=''
        this.otherId=''//这个为空表示处于空闲状态，否则处于忙碌状态
        this.socket =this.initSocket(opt.socketURL)
        this.peers={}//保存所有连接对象的dataChannel对象
        this.allConn={}//保存所有连接对象的PeerConnection对象
        this.openCallback=id=>console.log(id+' is opened!')
        this.addUser=idOther=> console.log("another user id is:",idOther)
        this.finish=()=>console.log('完成了一个协商')
    }
    initSocket(socketURL){
        var scope=this
        //alert(socketURL)
        var socket = io.connect(socketURL,{transports:['websocket','xhr-polling','jsonp-polling']})
        socket.on('id',  id=> {
            console.log("2.获取了自己的ID:"+id)
            scope.myId=id
            //console.log("your id is:",id)
            document.getElementsByTagName('title')[0].innerText=id
            // document.getElementsByTagName('h1')[0].innerText=id
        })
        socket.on('preconnect',  (data)=> {//收到一个请求
            console.log("3.收到建立连接的请求")
            //alert('收到了一个建立连接的请求：'+id)
            if(scope.peers[data.target]
                &&(scope.peers[data.target].readyState==='connecting'||scope.peers[data.target].readyState==='open')//已经打开或正在建立
            ){
                // connecting 正在建立连接 
                // open 连接已经建立 
                // closing 正在关闭连接（此时不能再向缓冲区中添加数据）
                // closed 连接已经关闭或尝试建立连接失败  
                console.log('这一链接已经建立:'+data.target) 
                //return 
            }
            scope.createPeerConnection(data.type,data.target)
        })
        socket.on('message', data=> {//用于接收SDP(offer/answer)和candidate
            //console.log("5.协商")
            scope.signalingMessageCallback(data.message,data.sourceId)
        })
        socket.on('peer_discon', data=> {//用于接收其他用户离开的消息
            delete scope.peers[data]
            delete scope.allConn[data]
            console.log('peer_discon',data)
        })
        return socket
    }
    sendMessage(message,targetType,otherId) {//用于发送offer、answer、candidate
        this.socket.emit('message', {
            message:message,
            targetId0:otherId,
            targetType:targetType,
            sourceId:this.myId
        })//用于发送SDP和candidate
    }
    idle(){//判断是否空闲
        console.log('this.otherId',this.otherId)
        console.log('this.peer',this.peers[this.otherId])
        return this.otherId===''||this.peers[this.otherId]
    }
    signalingMessageCallback(message,sourceId) {//分析收到的消息
        var scope=this
        var peerConn=this.allConn[sourceId]
        console.log('收到来自',sourceId,'的',message.type,'消息')
        if (message.type === 'offer') {//这个消息是offer方的sdp
            peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {}, scope.logError)
            peerConn.createAnswer().then(function(answer) {
                console.log("8.answer方开始生成SDP")
                return peerConn.setLocalDescription(answer);
            }).then(function() {
                // Send the answer to the remote peer through the signaling server.
                var obj=peerConn.localDescription
                obj.targetId0=scope.otherId
                scope.sendMessage(obj,'answer',sourceId)
                console.log('9.发送answer的SDP')
            }).catch(scope.logError);
            // peerConn.createAnswer(desc =>{
            //     console.log("12.开始生成answer的SDP")
            //     peerConn.setLocalDescription(desc).then(function() {
            //         var obj=peerConn.localDescription
            //         obj.targetId0=scope.otherId
            //         scope.sendMessage(obj,'answer',scope.otherId)
            //     }).catch(scope.logError)
            // }, scope.logError)
        } else if (message.type === 'answer') {//这个消息是发送给answer的sdp
            peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {}, scope.logError)
        } else if (message.type === 'candidate') {
            peerConn.addIceCandidate(new RTCIceCandidate({
                candidate: message.candidate,
                sdpMLineIndex: message.label,
                sdpMid: message.id
            }))
        }
    }
    createPeerConnection(type,otherId){
        var typeOther
        if(type==='offer')typeOther='answer'//自己是offer一方
        else typeOther='offer'//自己是answer一方

        var scope=this
        var peerConn = new RTCPeerConnection({iceServers: [
            {urls: 'stun:stun2.l.google.com:19302'},
            {urls: 'turn:120.48.84.35:3478',
             username:'brucewayne',
             credential:'12345'
            }
        ]})
        if(type==='offer')
            console.log("4.offer方生成RTCPeerConnection对象")
        else if(typeOther='answer')
            console.log("4.answer方生成RTCPeerConnection对象")

        scope.allConn[otherId]= peerConn
        peerConn.onicecandidate =
            //是收到 icecandidate 事件时调用的事件处理器.。
            //当一个 RTCICECandidate 对象被添加时，这个事件被触发。
            function(event) {
                if (event.candidate) {
                    console.log("10.收集本地candidate并发送到:"+otherId)
                    // console.log(event.candidate.candidate)
                    scope.sendMessage({//向对方发送自己的candidate
                        type: 'candidate',
                        label: event.candidate.sdpMLineIndex,
                        id: event.candidate.sdpMid,
                        candidate: event.candidate.candidate,
                    },typeOther,otherId)
                } else {
                    // console.log('on candidate : End of candidates.')
                    // if(type==='offer')
                }

                
            }
        if(type==='answer'){
            console.log("5.answer方生成channel对象")
            scope.onDataChannelCreated(peerConn.createDataChannel('photos', {negotiated: true, id: 0}),otherId)//answer方创建channel
            // peerConn.ondatachannel = function(event) {
            //     //收到datachannel 事件时调用的事件处理器。
            //     //当一个 RTCDataChannel 被添加到连接时，这个事件被触发
            //     console.log("19.新用户生成channel对象")
            //     scope.onDataChannelCreated(event.channel,otherId)//offer方接收channel
            // }
        }else{//type==='offer'
            // peerConn.ontrack = function(track_event){
            console.log("5.offer方生成channel对象")
            scope.onDataChannelCreated(peerConn.createDataChannel('photos', {negotiated: true, id: 0}),otherId)//answer方创建channel
            // }
            console.log("6.开始生成offer的SDP")
            peerConn.createOffer().then(function(offer) {
                // 生成一个offer，它是一个带有特定的配置信息寻找远端匹配机器（peer）的请求。
                // 这个方法的前两个参数分别是方法调用成功以及失败的回调函数，可选的第三个参数是用户对视频流以及音频流的定制选项（一个对象）。
                return peerConn.setLocalDescription(offer)
            }).then(() => {
                console.log("7.发送offer的SDP")
                scope.sendMessage(peerConn.localDescription,'offer',otherId)
            }).catch(scope.logError)
        }
        //scope.peers[channel.peerId]=channel
    }

    onDataChannelCreated(channel,otherId) {

        var scope=this
        scope.print['onDataChannelCreated'].push([
            channel.peerId,//成功建立连接的编号
            Math.round(performance.now())//成功建立连接的时刻
        ])

        
        channel.peerId=otherId
        channel.onopen = ()=>{
            console.log('11.channel打开')
            if(scope.print.first_channel_onopen_time===-1)
                scope.print.first_channel_onopen_time=performance.now()
            scope.print['onopen'].push([
                channel.peerId,//成功建立连接的编号
                Math.round(performance.now())//成功建立连接的时刻
            ])
            scope.peers[channel.peerId]=channel
            scope.openCallback(channel.peerId)
            scope.finish()
        }
        channel.onmessage=message=>console.log("message",message)
        channel.onclose=()=>{//当接收到close事件时候的事件处理器。当底层链路被关闭的时候会触发该事件。
            console.log('连接中断')
            // scope.showOther(otherId,'断开')
            //发送方易中断，接收方不易中断
            scope.print['onclose'].push([
                channel.peerId,
                channel.readyState,
                channel.bufferedAmount,
                Math.round(performance.now()),
            ])

            //有的中断可以底层自动重连，有的中断只能通过以下代码重连
            setTimeout(()=>{
                if(channel.readyState==='open')return
                else{
                    scope.otherId=channel.peerId
                    console.log(
                        '申请建立连接：',
                        {
                            offerId:scope.myId, 
                            answerId:channel.peerId
                        }
                    )
                    scope.createPeerConnection('offer',channel.peerId)//准备offer
                    scope.socket.emit('connect0', {
                        offerId:scope.myId, 
                        answerId:channel.peerId
                    })
                }
            },100)//对于关闭的通道应该重新连接
        }
    }
    logError(err) {
        console.log('连接失败',err,this)
        //this.otherId=''//这个为空表示处于空闲状态
        //this.finish()
    }

    showOther(id,state){
        if(document.getElementsByTagName('title')[0].innerText)
        console.log(document.getElementsByTagName('title')[0].innerText)
        var obj = document.getElementById(id)
        if(obj==null){
            var ele = document.createElement('a')
            ele.innerHTML = 
            '<div id="'+id+'" style="background-color:#e5b081;height:25px;width:100%;float:left;border: 2px solid #494443;">'+
                '<b>'+id+'&emsp;</b>'+
                '<b id="state">('+state+')&emsp;</b>'+
            '</div>'
            document.getElementById('container').appendChild(ele)
        }
        else{
            obj.childNodes[1].innerText = '('+state+')'
        }
        
    }

}
export {Peer}
