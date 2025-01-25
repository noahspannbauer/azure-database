import { TableClient, TableServiceClient } from '@azure/data-tables';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AZURE_TABLE_STORAGE_NAME } from './azure-table.constant';
const logger = new Logger('AzureTableStorage');

@Injectable()
export class AzureTableStorageService {
  constructor(@Inject(AZURE_TABLE_STORAGE_NAME) private readonly tableName: string) {}
  private tableServiceClient: TableServiceClient;
  private tableClient: TableClient;
  get tableServiceClientInstance() {
    if (this.tableServiceClient) {
      return this.tableServiceClient;
    }
    this.tableServiceClient = TableServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    return this.tableServiceClient;
  }

  get tableClientInstance() {
    if (this.tableClient) {
      return this.tableClient;
    }
    this.tableClient = TableClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING, this.tableName, {
      allowInsecureConnection: true
    });
    return this.tableClient;
  }
}
