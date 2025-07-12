# CRM 系统集成指南

## 概述

Octopus Messenger 支持与多种主流CRM和任务管理系统集成，自动将分类后的客户消息转换为任务、工单或潜在客户线索。

## 支持的CRM系统

### 🏢 企业级CRM

#### 1. Salesforce
- **类型**: 全球最大的CRM平台
- **适用**: 大型企业、复杂销售流程
- **集成方式**: REST API + OAuth 2.0

#### 2. Microsoft Dynamics 365
- **类型**: 微软企业解决方案
- **适用**: 使用Microsoft生态的企业
- **集成方式**: Web API + Azure AD

#### 3. HubSpot
- **类型**: 入站营销CRM
- **适用**: 中小企业、营销导向
- **集成方式**: REST API + API Key

### 📱 中国本土CRM

#### 4. 钉钉（DingTalk）
- **类型**: 阿里巴巴企业协作平台
- **适用**: 中国企业、移动办公
- **集成方式**: 开放平台API

#### 5. 企业微信
- **类型**: 腾讯企业通讯解决方案
- **适用**: 微信生态企业
- **集成方式**: 企业微信API

#### 6. 飞书（Lark）
- **类型**: 字节跳动协作平台
- **适用**: 现代化团队协作
- **集成方式**: 开放平台API

### 🚀 现代化工具

#### 7. Notion
- **类型**: 全能工作空间
- **适用**: 灵活的团队管理
- **集成方式**: Notion API

#### 8. Airtable
- **类型**: 可视化数据库
- **适用**: 数据驱动的团队
- **集成方式**: REST API

#### 9. Monday.com
- **类型**: 工作操作系统
- **适用**: 项目和客户管理
- **集成方式**: GraphQL API

### 📋 项目管理工具

#### 10. Jira
- **类型**: Atlassian项目管理
- **适用**: 技术团队、敏捷开发
- **集成方式**: REST API

#### 11. Asana
- **类型**: 团队协作平台
- **适用**: 任务导向的团队
- **集成方式**: REST API

#### 12. ClickUp
- **类型**: 全功能生产力平台
- **适用**: 需要统一工作空间的团队
- **集成方式**: REST API v2

#### 13. Linear
- **类型**: 现代化问题跟踪
- **适用**: 产品和工程团队
- **集成方式**: GraphQL API

#### 14. Trello
- **类型**: 看板式项目管理
- **适用**: 简单的任务管理
- **集成方式**: REST API

### 💼 其他专业工具

#### 15. Zoho CRM
- **类型**: 一体化业务套件
- **适用**: 中小企业
- **集成方式**: REST API v2

#### 16. Pipedrive
- **类型**: 销售管道CRM
- **适用**: 销售团队
- **集成方式**: REST API

---

## 集成配置

### 通用配置结构

```json
{
  "crmIntegrations": [
    {
      "id": "primary-crm",
      "name": "主要CRM系统",
      "type": "salesforce",
      "enabled": true,
      "priority": 1,
      "config": {
        "authType": "oauth2",
        "credentials": {},
        "endpoints": {},
        "mappings": {}
      },
      "rules": {
        "conditions": [],
        "actions": []
      }
    }
  ]
}
```

### Salesforce 集成

#### 配置示例
```json
{
  "type": "salesforce",
  "config": {
    "authType": "oauth2",
    "credentials": {
      "clientId": "your-connected-app-client-id",
      "clientSecret": "your-client-secret",
      "username": "your-salesforce-username",
      "password": "your-password-and-security-token",
      "sandbox": false
    },
    "endpoints": {
      "baseUrl": "https://your-instance.salesforce.com",
      "apiVersion": "v58.0"
    },
    "mappings": {
      "lead": {
        "firstName": "{{senderName}}",
        "lastName": "客户",
        "email": "{{senderEmail}}",
        "phone": "{{senderPhone}}",
        "company": "{{tenantName}}",
        "leadSource": "{{platform}}",
        "description": "{{messageContent}}"
      },
      "case": {
        "subject": "客户咨询 - {{category}}",
        "description": "{{messageContent}}",
        "priority": "{{priority}}",
        "origin": "{{platform}}",
        "status": "New"
      }
    }
  }
}
```

#### 集成代码
```javascript
// services/task-service/src/integrations/salesforce.js
class SalesforceIntegration {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
  }

  async authenticate() {
    const authUrl = `${this.config.endpoints.baseUrl}/services/oauth2/token`;
    const response = await axios.post(authUrl, {
      grant_type: 'password',
      client_id: this.config.credentials.clientId,
      client_secret: this.config.credentials.clientSecret,
      username: this.config.credentials.username,
      password: this.config.credentials.password
    });
    
    this.accessToken = response.data.access_token;
    return this.accessToken;
  }

  async createLead(messageData, classification) {
    const leadData = this.mapToLead(messageData, classification);
    
    const response = await axios.post(
      `${this.config.endpoints.baseUrl}/services/data/v${this.config.endpoints.apiVersion}/sobjects/Lead/`,
      leadData,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  }

  async createCase(messageData, classification) {
    const caseData = this.mapToCase(messageData, classification);
    
    const response = await axios.post(
      `${this.config.endpoints.baseUrl}/services/data/v${this.config.endpoints.apiVersion}/sobjects/Case/`,
      caseData,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  }
}
```

### HubSpot 集成

#### 配置示例
```json
{
  "type": "hubspot",
  "config": {
    "authType": "apikey",
    "credentials": {
      "apiKey": "your-hubspot-api-key"
    },
    "endpoints": {
      "baseUrl": "https://api.hubapi.com"
    },
    "mappings": {
      "contact": {
        "firstname": "{{senderFirstName}}",
        "lastname": "{{senderLastName}}",
        "email": "{{senderEmail}}",
        "phone": "{{senderPhone}}",
        "lifecyclestage": "lead",
        "lead_source": "{{platform}}"
      },
      "ticket": {
        "subject": "{{category}} - {{messageContent|truncate:50}}",
        "content": "{{messageContent}}",
        "hs_pipeline": "support_pipeline",
        "hs_pipeline_stage": "new",
        "hs_ticket_priority": "{{priority}}"
      }
    }
  }
}
```

### 钉钉集成

#### 配置示例
```json
{
  "type": "dingtalk",
  "config": {
    "authType": "app_secret",
    "credentials": {
      "appKey": "your-app-key",
      "appSecret": "your-app-secret"
    },
    "endpoints": {
      "baseUrl": "https://oapi.dingtalk.com"
    },
    "mappings": {
      "task": {
        "subject": "客户咨询 - {{category}}",
        "description": "{{messageContent}}",
        "priority": "{{priority}}",
        "executorIds": ["{{assigneeUserId}}"],
        "participantIds": [],
        "ccIds": []
      }
    }
  }
}
```

### 企业微信集成

#### 配置示例
```json
{
  "type": "wework",
  "config": {
    "authType": "corp_secret",
    "credentials": {
      "corpId": "your-corp-id",
      "agentId": "your-agent-id",
      "secret": "your-agent-secret"
    },
    "endpoints": {
      "baseUrl": "https://qyapi.weixin.qq.com"
    },
    "mappings": {
      "oa_approval": {
        "template_id": "customer_inquiry_template",
        "applicant": "{{systemUserId}}",
        "approver": ["{{managerUserId}}"],
        "data": {
          "customer_name": "{{senderName}}",
          "platform": "{{platform}}",
          "content": "{{messageContent}}",
          "category": "{{category}}",
          "priority": "{{priority}}"
        }
      }
    }
  }
}
```

### Notion 集成

#### 配置示例
```json
{
  "type": "notion",
  "config": {
    "authType": "integration_token",
    "credentials": {
      "token": "your-notion-integration-token"
    },
    "endpoints": {
      "baseUrl": "https://api.notion.com/v1"
    },
    "databaseId": "your-database-id",
    "mappings": {
      "page": {
        "properties": {
          "客户姓名": {
            "title": [{"text": {"content": "{{senderName}}"}}]
          },
          "平台": {
            "select": {"name": "{{platform}}"}
          },
          "分类": {
            "select": {"name": "{{category}}"}
          },
          "优先级": {
            "select": {"name": "{{priority}}"}
          },
          "状态": {
            "select": {"name": "待处理"}
          },
          "内容": {
            "rich_text": [{"text": {"content": "{{messageContent}}"}}]
          },
          "创建时间": {
            "date": {"start": "{{receivedAt}}"}
          }
        }
      }
    }
  }
}
```

### Monday.com 集成

#### 配置示例
```json
{
  "type": "monday",
  "config": {
    "authType": "api_token",
    "credentials": {
      "token": "your-monday-api-token"
    },
    "endpoints": {
      "baseUrl": "https://api.monday.com/v2"
    },
    "boardId": "your-board-id",
    "mappings": {
      "item": {
        "name": "{{category}} - {{senderName}}",
        "columnValues": {
          "status": "待处理",
          "priority": "{{priority}}",
          "platform": "{{platform}}",
          "customer_name": "{{senderName}}",
          "content": "{{messageContent}}",
          "received_date": "{{receivedAt}}"
        }
      }
    }
  }
}
```

---

## 多CRM策略

### 1. 主备模式
```json
{
  "strategy": "primary_backup",
  "primary": {
    "type": "salesforce",
    "fallback": "hubspot"
  },
  "rules": {
    "if_primary_fails": "use_backup",
    "sync_back": true
  }
}
```

### 2. 分类路由
```json
{
  "strategy": "category_routing",
  "routes": {
    "销售线索": ["salesforce", "hubspot"],
    "技术支持": ["jira", "linear"],
    "客户服务": ["zendesk", "freshdesk"],
    "产品反馈": ["notion", "airtable"]
  }
}
```

### 3. 并行同步
```json
{
  "strategy": "parallel_sync",
  "targets": [
    {
      "type": "salesforce",
      "objects": ["lead", "case"]
    },
    {
      "type": "slack",
      "channels": ["#customer-support"]
    },
    {
      "type": "email",
      "recipients": ["support@company.com"]
    }
  ]
}
```

---

## 集成管理

### 配置界面

#### 1. CRM系统选择
```javascript
// 管理面板中的CRM选择组件
const CRMSelector = () => {
  const [selectedCRM, setSelectedCRM] = useState('lark');
  
  const crmOptions = [
    { id: 'salesforce', name: 'Salesforce', icon: 'salesforce' },
    { id: 'hubspot', name: 'HubSpot', icon: 'hubspot' },
    { id: 'dingtalk', name: '钉钉', icon: 'dingtalk' },
    { id: 'wework', name: '企业微信', icon: 'wework' },
    { id: 'notion', name: 'Notion', icon: 'notion' },
    { id: 'monday', name: 'Monday.com', icon: 'monday' },
    { id: 'jira', name: 'Jira', icon: 'jira' },
    { id: 'asana', name: 'Asana', icon: 'asana' }
  ];
  
  return (
    <div className="crm-selector">
      <h3>选择CRM系统</h3>
      <div className="crm-grid">
        {crmOptions.map(crm => (
          <div 
            key={crm.id} 
            className={`crm-card ${selectedCRM === crm.id ? 'selected' : ''}`}
            onClick={() => setSelectedCRM(crm.id)}
          >
            <img src={`/icons/${crm.icon}.svg`} alt={crm.name} />
            <span>{crm.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

#### 2. 连接测试
```javascript
const testCRMConnection = async (crmConfig) => {
  try {
    const response = await fetch('/api/crm/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(crmConfig)
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('CRM连接测试失败:', error);
    return { success: false, error: error.message };
  }
};
```

### API端点

#### 获取支持的CRM列表
```bash
GET /api/crm/supported
```

#### 配置CRM集成
```bash
POST /api/crm/configure
{
  "type": "salesforce",
  "config": {...},
  "enabled": true
}
```

#### 测试CRM连接
```bash
POST /api/crm/test-connection
{
  "type": "salesforce",
  "config": {...}
}
```

#### 同步状态查询
```bash
GET /api/crm/sync-status/{integration-id}
```

---

## 最佳实践

### 1. 选择建议

#### 大型企业
- **首选**: Salesforce + Microsoft Dynamics 365
- **备选**: HubSpot Enterprise

#### 中小企业
- **首选**: HubSpot + Monday.com
- **备选**: Zoho CRM + Asana

#### 中国企业
- **首选**: 钉钉 + 企业微信
- **备选**: 飞书 + 腾讯文档

#### 技术团队
- **首选**: Jira + Linear
- **备选**: GitHub Issues + ClickUp

#### 创业公司
- **首选**: Notion + Airtable
- **备选**: Trello + Monday.com

### 2. 集成策略

#### 渐进式集成
1. 从一个主要CRM开始
2. 验证数据同步准确性
3. 逐步添加其他系统
4. 优化集成规则

#### 数据一致性
1. 建立统一的数据模型
2. 设置数据验证规则
3. 定期同步检查
4. 处理冲突数据

#### 性能优化
1. 使用异步处理
2. 批量操作优化
3. 缓存常用数据
4. 监控API限制

### 3. 故障处理

#### 重试机制
```javascript
const retryIntegration = async (operation, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
};
```

#### 降级策略
```javascript
const fallbackIntegration = async (primaryCRM, fallbackCRM, data) => {
  try {
    return await primaryCRM.createTask(data);
  } catch (error) {
    logger.warn('Primary CRM failed, using fallback', { error });
    return await fallbackCRM.createTask(data);
  }
};
```

这样的多CRM集成方案让企业客户可以继续使用现有的系统，同时享受Octopus Messenger的智能消息处理能力！ 