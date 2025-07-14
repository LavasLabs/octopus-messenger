// optimization_collections_setup.js
// MongoDB优化相关集合的创建和索引设置

// 连接到数据库
use octopus_messenger;

// =====================================================
// 1. 存储优化集合
// =====================================================

// 消息存储集合 (按存储级别分类)
db.createCollection("messages", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "conversationId", "tenantId", "content", "storageLevel"],
      properties: {
        _id: { bsonType: "string" },
        conversationId: { bsonType: "string" },
        tenantId: { bsonType: "string" },
        content: { bsonType: "string" },
        metadata: { bsonType: "object" },
        timestamp: { bsonType: "date" },
        storageLevel: { 
          bsonType: "string", 
          enum: ["hot", "warm", "cold"] 
        },
        compressed: { bsonType: "bool" },
        compressionLevel: { bsonType: "string" }
      }
    }
  }
});

// 温数据归档集合
db.createCollection("messages_archive", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "conversationId", "tenantId", "content", "storageLevel"],
      properties: {
        _id: { bsonType: "string" },
        conversationId: { bsonType: "string" },
        tenantId: { bsonType: "string" },
        content: { bsonType: "string" },
        metadata: { bsonType: "object" },
        timestamp: { bsonType: "date" },
        storageLevel: { bsonType: "string" },
        compressed: { bsonType: "bool" }
      }
    }
  }
});

// 冷数据归档集合
db.createCollection("messages_cold_archive", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "tenantId", "content", "storageLevel"],
      properties: {
        _id: { bsonType: "string" },
        tenantId: { bsonType: "string" },
        content: { bsonType: "string" },
        essentialMeta: { bsonType: "object" },
        storageLevel: { bsonType: "string" },
        compressed: { bsonType: "bool" },
        compressionLevel: { bsonType: "string" }
      }
    }
  }
});

// =====================================================
// 2. 性能监控集合
// =====================================================

// AI分类器性能记录
db.createCollection("ai_classifier_metrics", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["classifier", "timestamp", "metrics"],
      properties: {
        classifier: { bsonType: "string" },
        timestamp: { bsonType: "date" },
        metrics: {
          bsonType: "object",
          properties: {
            responseTime: { bsonType: "number" },
            confidence: { bsonType: "number" },
            success: { bsonType: "bool" },
            errorMessage: { bsonType: "string" }
          }
        },
        context: { bsonType: "object" }
      }
    }
  }
});

// 服务性能指标集合
db.createCollection("service_performance_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["serviceName", "timestamp", "metrics"],
      properties: {
        serviceName: { bsonType: "string" },
        instanceUrl: { bsonType: "string" },
        timestamp: { bsonType: "date" },
        metrics: {
          bsonType: "object",
          properties: {
            responseTime: { bsonType: "number" },
            throughput: { bsonType: "number" },
            errorRate: { bsonType: "number" },
            healthStatus: { bsonType: "string" },
            connections: { bsonType: "number" }
          }
        }
      }
    }
  }
});

// 缓存性能统计集合
db.createCollection("cache_performance_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["cacheType", "timestamp", "operation"],
      properties: {
        cacheType: { 
          bsonType: "string",
          enum: ["classification", "translation", "conversation", "context"]
        },
        timestamp: { bsonType: "date" },
        operation: {
          bsonType: "string",
          enum: ["hit", "miss", "set", "evict"]
        },
        keyPattern: { bsonType: "string" },
        responseTime: { bsonType: "number" },
        dataSize: { bsonType: "number" },
        metadata: { bsonType: "object" }
      }
    }
  }
});

// =====================================================
// 3. 平台优化集合
// =====================================================

// 平台消息处理日志
db.createCollection("platform_message_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["platform", "messageId", "timestamp", "processingResult"],
      properties: {
        platform: { bsonType: "string" },
        messageId: { bsonType: "string" },
        timestamp: { bsonType: "date" },
        processingResult: {
          bsonType: "object",
          properties: {
            success: { bsonType: "bool" },
            processingTime: { bsonType: "number" },
            errorMessage: { bsonType: "string" },
            rateLimited: { bsonType: "bool" }
          }
        },
        messageData: { bsonType: "object" }
      }
    }
  }
});

// =====================================================
// 4. CRM优化集合
// =====================================================

// CRM操作日志
db.createCollection("crm_operation_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["crmSystem", "operation", "timestamp", "result"],
      properties: {
        crmSystem: { bsonType: "string" },
        operation: { 
          bsonType: "string",
          enum: ["create", "update", "query", "sync"]
        },
        timestamp: { bsonType: "date" },
        result: {
          bsonType: "object",
          properties: {
            success: { bsonType: "bool" },
            responseTime: { bsonType: "number" },
            errorMessage: { bsonType: "string" },
            recordId: { bsonType: "string" }
          }
        },
        taskData: { bsonType: "object" },
        routingReason: { bsonType: "string" }
      }
    }
  }
});

// =====================================================
// 5. 系统监控集合
// =====================================================

// 系统健康检查日志
db.createCollection("system_health_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "systemMetrics"],
      properties: {
        timestamp: { bsonType: "date" },
        systemMetrics: {
          bsonType: "object",
          properties: {
            cpu: { bsonType: "object" },
            memory: { bsonType: "object" },
            disk: { bsonType: "object" },
            network: { bsonType: "object" }
          }
        },
        serviceHealth: { bsonType: "object" },
        businessMetrics: { bsonType: "object" }
      }
    }
  }
});

// 告警事件日志
db.createCollection("alert_events", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["alertId", "severity", "timestamp", "message"],
      properties: {
        alertId: { bsonType: "string" },
        severity: { 
          bsonType: "string",
          enum: ["critical", "warning", "info"]
        },
        category: { bsonType: "string" },
        metricName: { bsonType: "string" },
        currentValue: { bsonType: "number" },
        thresholdValue: { bsonType: "number" },
        message: { bsonType: "string" },
        timestamp: { bsonType: "date" },
        resolved: { bsonType: "bool" },
        resolvedAt: { bsonType: "date" },
        metadata: { bsonType: "object" }
      }
    }
  }
});

// =====================================================
// 6. 创建索引
// =====================================================

// 消息存储相关索引
db.messages.createIndex({ "conversationId": 1, "timestamp": -1 });
db.messages.createIndex({ "tenantId": 1, "storageLevel": 1 });
db.messages.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 604800 }); // 7天TTL

db.messages_archive.createIndex({ "conversationId": 1, "timestamp": -1 });
db.messages_archive.createIndex({ "tenantId": 1, "timestamp": -1 });
db.messages_archive.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 }); // 30天TTL

db.messages_cold_archive.createIndex({ "tenantId": 1 });
db.messages_cold_archive.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 31536000 }); // 1年TTL

// 性能监控相关索引
db.ai_classifier_metrics.createIndex({ "classifier": 1, "timestamp": -1 });
db.ai_classifier_metrics.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 }); // 30天TTL
db.ai_classifier_metrics.createIndex({ "metrics.success": 1, "classifier": 1 });

db.service_performance_logs.createIndex({ "serviceName": 1, "timestamp": -1 });
db.service_performance_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 }); // 30天TTL
db.service_performance_logs.createIndex({ "metrics.healthStatus": 1, "serviceName": 1 });

db.cache_performance_logs.createIndex({ "cacheType": 1, "timestamp": -1 });
db.cache_performance_logs.createIndex({ "operation": 1, "cacheType": 1 });
db.cache_performance_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 604800 }); // 7天TTL

// 平台优化相关索引
db.platform_message_logs.createIndex({ "platform": 1, "timestamp": -1 });
db.platform_message_logs.createIndex({ "processingResult.success": 1, "platform": 1 });
db.platform_message_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 }); // 30天TTL

// CRM优化相关索引
db.crm_operation_logs.createIndex({ "crmSystem": 1, "timestamp": -1 });
db.crm_operation_logs.createIndex({ "operation": 1, "crmSystem": 1 });
db.crm_operation_logs.createIndex({ "result.success": 1, "crmSystem": 1 });
db.crm_operation_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 }); // 30天TTL

// 系统监控相关索引
db.system_health_logs.createIndex({ "timestamp": -1 });
db.system_health_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 604800 }); // 7天TTL

db.alert_events.createIndex({ "severity": 1, "timestamp": -1 });
db.alert_events.createIndex({ "alertId": 1 });
db.alert_events.createIndex({ "resolved": 1, "severity": 1 });
db.alert_events.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 7776000 }); // 90天TTL

// =====================================================
// 7. 创建聚合视图
// =====================================================

// 创建每日AI分类器性能摘要视图
db.createView("daily_ai_performance_summary", "ai_classifier_metrics", [
  {
    $match: {
      timestamp: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内
      }
    }
  },
  {
    $group: {
      _id: {
        classifier: "$classifier",
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$timestamp"
          }
        }
      },
      totalRequests: { $sum: 1 },
      successfulRequests: {
        $sum: { $cond: ["$metrics.success", 1, 0] }
      },
      avgResponseTime: { $avg: "$metrics.responseTime" },
      avgConfidence: { $avg: "$metrics.confidence" },
      errorRate: {
        $avg: { $cond: ["$metrics.success", 0, 1] }
      }
    }
  },
  {
    $addFields: {
      successRate: {
        $divide: ["$successfulRequests", "$totalRequests"]
      },
      performanceScore: {
        $multiply: [
          { $divide: ["$successfulRequests", "$totalRequests"] },
          { $divide: ["$avgConfidence", 1] },
          100
        ]
      }
    }
  },
  {
    $sort: { "_id.date": -1, "performanceScore": -1 }
  }
]);

// 创建平台性能摘要视图
db.createView("platform_performance_summary", "platform_message_logs", [
  {
    $match: {
      timestamp: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7天内
      }
    }
  },
  {
    $group: {
      _id: "$platform",
      totalMessages: { $sum: 1 },
      successfulMessages: {
        $sum: { $cond: ["$processingResult.success", 1, 0] }
      },
      avgProcessingTime: { $avg: "$processingResult.processingTime" },
      rateLimitedCount: {
        $sum: { $cond: ["$processingResult.rateLimited", 1, 0] }
      },
      lastActivity: { $max: "$timestamp" }
    }
  },
  {
    $addFields: {
      successRate: {
        $divide: ["$successfulMessages", "$totalMessages"]
      },
      rateLimitRate: {
        $divide: ["$rateLimitedCount", "$totalMessages"]
      }
    }
  },
  {
    $sort: { "successRate": -1, "avgProcessingTime": 1 }
  }
]);

// 创建存储效率摘要视图
db.createView("storage_efficiency_summary", "messages", [
  {
    $group: {
      _id: "$storageLevel",
      messageCount: { $sum: 1 },
      avgCompressionRatio: {
        $avg: {
          $cond: [
            "$compressed",
            { $divide: [{ $bsonSize: "$content" }, { $bsonSize: "$$ROOT" }] },
            1
          ]
        }
      },
      totalSize: { $sum: { $bsonSize: "$$ROOT" } },
      compressedCount: {
        $sum: { $cond: ["$compressed", 1, 0] }
      }
    }
  },
  {
    $addFields: {
      compressionRate: {
        $divide: ["$compressedCount", "$messageCount"]
      },
      avgSizePerMessage: {
        $divide: ["$totalSize", "$messageCount"]
      }
    }
  },
  {
    $sort: { "_id": 1 }
  }
]);

// 创建CRM性能摘要视图
db.createView("crm_performance_summary", "crm_operation_logs", [
  {
    $match: {
      timestamp: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7天内
      }
    }
  },
  {
    $group: {
      _id: "$crmSystem",
      totalOperations: { $sum: 1 },
      successfulOperations: {
        $sum: { $cond: ["$result.success", 1, 0] }
      },
      avgResponseTime: { $avg: "$result.responseTime" },
      lastOperation: { $max: "$timestamp" },
      operationTypes: { $addToSet: "$operation" }
    }
  },
  {
    $addFields: {
      successRate: {
        $divide: ["$successfulOperations", "$totalOperations"]
      },
      performanceScore: {
        $multiply: [
          { $divide: ["$successfulOperations", "$totalOperations"] },
          { $cond: [{ $gt: ["$avgResponseTime", 0] }, { $divide: [5000, "$avgResponseTime"] }, 1] },
          100
        ]
      }
    }
  },
  {
    $sort: { "performanceScore": -1 }
  }
]);

// =====================================================
// 8. 初始化示例数据
// =====================================================

// 插入一些示例性能数据
db.ai_classifier_metrics.insertMany([
  {
    classifier: "openai",
    timestamp: new Date(),
    metrics: {
      responseTime: 1500,
      confidence: 0.92,
      success: true
    },
    context: { messageType: "text", language: "en" }
  },
  {
    classifier: "claude",
    timestamp: new Date(),
    metrics: {
      responseTime: 1200,
      confidence: 0.89,
      success: true
    },
    context: { messageType: "text", language: "zh" }
  },
  {
    classifier: "ruleEngine",
    timestamp: new Date(),
    metrics: {
      responseTime: 50,
      confidence: 0.75,
      success: true
    },
    context: { messageType: "text", language: "en" }
  }
]);

// 插入一些服务性能数据
db.service_performance_logs.insertMany([
  {
    serviceName: "gateway",
    instanceUrl: "http://localhost:3000",
    timestamp: new Date(),
    metrics: {
      responseTime: 120,
      throughput: 1500,
      errorRate: 0.01,
      healthStatus: "healthy",
      connections: 45
    }
  },
  {
    serviceName: "ai-service",
    instanceUrl: "http://localhost:3001",
    timestamp: new Date(),
    metrics: {
      responseTime: 800,
      throughput: 500,
      errorRate: 0.02,
      healthStatus: "healthy",
      connections: 12
    }
  }
]);

// 插入一些缓存性能数据
db.cache_performance_logs.insertMany([
  {
    cacheType: "classification",
    timestamp: new Date(),
    operation: "hit",
    keyPattern: "classification:*",
    responseTime: 5,
    dataSize: 1024
  },
  {
    cacheType: "translation",
    timestamp: new Date(),
    operation: "miss",
    keyPattern: "translation:*",
    responseTime: 15,
    dataSize: 2048
  }
]);

print("MongoDB优化集合创建完成！");
print("已创建以下集合:");
print("- messages (热数据存储)");
print("- messages_archive (温数据存储)");
print("- messages_cold_archive (冷数据存储)");
print("- ai_classifier_metrics (AI分类器性能)");
print("- service_performance_logs (服务性能日志)");
print("- cache_performance_logs (缓存性能日志)");
print("- platform_message_logs (平台消息日志)");
print("- crm_operation_logs (CRM操作日志)");
print("- system_health_logs (系统健康日志)");
print("- alert_events (告警事件)");
print("");
print("已创建以下聚合视图:");
print("- daily_ai_performance_summary");
print("- platform_performance_summary");
print("- storage_efficiency_summary");
print("- crm_performance_summary");
print("");
print("所有索引和TTL规则已配置完成！"); 