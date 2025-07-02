[0;1;32m●[0m mongod.service - MongoDB Database Server
     Loaded: loaded (/lib/systemd/system/mongod.service; enabled; vendor preset: enabled)
     Active: [0;1;32mactive (running)[0m since Wed 2025-07-02 17:24:06 MSK; 59s ago
       Docs: https://docs.mongodb.org/manual
   Main PID: 66768 (mongod)
     Memory: 73.3M
        CPU: 450ms
     CGroup: /system.slice/mongod.service
             └─66768 /usr/bin/mongod --config /etc/mongod.conf

Jul 02 17:24:06 civil-turkeyn3.aeza.network systemd[1]: Started MongoDB Database Server.
Jul 02 17:24:06 civil-turkeyn3.aeza.network mongod[66768]: {"t":{"$date":"2025-07-02T14:24:06.536Z"},"s":"I",  "c":"CONTROL",  "id":7484500, "ctx":"main","msg":"Environment variable MONGODB_CONFIG_OVERRIDE_NOFORK == 1, overriding \"processManagement.fork\" to false"}
