import { DeleteTableEntityResponse, RestError, TableEntity, TableEntityQueryOptions } from '@azure/data-tables';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AZURE_TABLE_STORAGE_FEATURE_OPTIONS, AZURE_TABLE_STORAGE_NAME } from './azure-table.constant';
import { AzureTableStorageFeatureOptions } from './azure-table.interface';
import { AzureEntityMapper } from './azure-table.mapper';
import { AzureTableStorageService } from './azure-table.service';
import { CustomError } from '@noahspan/noahspan-modules';

const logger = new Logger(`AzureStorageRepository`);

type PartitionRowKeyValuePair = {
  partitionKey: string;
  rowKey: string;
};

@Injectable()
export class AzureTableStorageRepository<T> {
  constructor(
    private readonly manager: AzureTableStorageService,
    @Inject(AZURE_TABLE_STORAGE_NAME) private readonly tableName: string,
    @Inject(AZURE_TABLE_STORAGE_FEATURE_OPTIONS) private readonly options: AzureTableStorageFeatureOptions,
  ) {}

  get tableServiceClientInstance() {
    return this.manager.tableServiceClientInstance;
  }

  get tableClientInstance() {
    return this.manager.tableClientInstance;
  }

  async createTableIfNotExists(tableName?: string): Promise<boolean | null> {
    logger.debug(`Create table: ${tableName} (if not exists)`);

    try {
      await this.tableServiceClientInstance.createTable(tableName);
      return true;
    } catch (error) {
      const restError = error as RestError;
      const customError: CustomError = await this.handleRestErrors(restError);

      throw customError;
    }
  }

  async find(partitionKey: string, rowKey: string): Promise<T> {
    logger.debug(`Looking for entity in table: ${this.tableName}`);
    logger.debug(`- partitionKey: ${partitionKey}`);
    logger.debug(`- rowKey: ${rowKey}`);

    try {
      const result = await this.manager.tableClientInstance.getEntity(partitionKey, rowKey);
      const mappedEntity = AzureEntityMapper.serialize<T>(result);

      if (Object.entries(mappedEntity).length === 0) {
        logger.debug(`Failed to fetch entity`);
        return null;
      }

      logger.debug(`Entity fetched successfully`);
      return mappedEntity;
    } catch (error) {
      const restError = error as RestError;
      const customError: CustomError = await this.handleRestErrors(restError);

      throw customError;
    }
  }

  async findAll(options: { queryOptions?: TableEntityQueryOptions } = {}): Promise<T[]> {
    logger.debug(`Looking for entities in table: ${this.tableName}`);

    try {
      const records = this.tableClientInstance.listEntities({
        queryOptions: options.queryOptions,
      });

      const entities = [];
      for await (const entity of records) {
        entities.push(entity);
      }

      logger.debug(`Entities fetched successfully`);
      return entities;
    } catch (error) {
      const restError = error as RestError;
      const customError: CustomError = await this.handleRestErrors(restError);

      throw customError;
    }
  }

  async create(entity: T): Promise<T | null> {
    if (this.options.createTableIfNotExists) {
      const res = await this.createTableIfNotExists(this.tableName);
      if (res === null) {
        return null;
      }
    }

    logger.debug(`Creating entity in table: ${this.tableName}`);
    logger.debug(`- partitionKey: ${(entity as TableEntity).partitionKey}`);
    logger.debug(`- rowKey: ${(entity as TableEntity).rowKey}`);

    try {
      const result = await this.manager.tableClientInstance.createEntity(entity as PartitionRowKeyValuePair);
      logger.debug(`Entity created successfully`);
      return AzureEntityMapper.serialize<T>(result);
    } catch (error) {
      const restError = error as RestError;
      const customError: CustomError = await this.handleRestErrors(restError);

      throw customError;
    }
  }

  async update(partitionKey: string, rowKey: string, entity: T): Promise<T> {
    logger.debug(`Updating entity in table: ${this.tableName}`);
    logger.debug(`- partitionKey: ${partitionKey}`);
    logger.debug(`- rowKey: ${rowKey}`);

    if (!entity.hasOwnProperty('rowKey')) {
      entity['rowKey'] = rowKey;
    }

    if (!entity.hasOwnProperty('partitionKey')) {
      entity['partitionKey'] = partitionKey;
    }

    try {
      const result = await this.manager.tableClientInstance.updateEntity(entity as PartitionRowKeyValuePair);

      logger.debug(`Entity updated successfully`);
      return AzureEntityMapper.serialize<T>(result);
    } catch (error) {
      const restError = error as RestError;
      const customError: CustomError = await this.handleRestErrors(restError);

      throw customError;
    }
  }

  async delete(partitionKey: string, rowKey: string): Promise<DeleteTableEntityResponse> {
    logger.debug(`Deleting entity in table: ${this.tableName}`);
    logger.debug(`- partitionKey: ${partitionKey}`);
    logger.debug(`- rowKey: ${rowKey}`);

    try {
      const result = await this.manager.tableClientInstance.deleteEntity(partitionKey, rowKey);

      logger.debug(`Entity deleted successfully`);
      return result;
    } catch (error) {
      const restError = error as RestError;
      const customError: CustomError = await this.handleRestErrors(restError);

      throw customError;
    }
  }

  private async handleRestErrors(error: RestError): Promise<CustomError> {
    // TODO: figure out how to parse odata errors
    if (!error.message.startsWith('{')) {
      throw new Error(error.message);
    }

    // const err = JSON.parse(error.message);
    const errorCode: string = error.details['odataError']['code']
    let errorMessage: string;

    switch (errorCode) {
      case 'TableAlreadyExists':
        errorMessage = `Error creating table. Table ${this.tableName} already exists.`;
        logger.error(errorMessage);

        break;
      case 'TableNotFound':
        errorMessage = `Error creating entity. Table ${this.tableName} Not Found. Is it created?`;
        logger.error(errorMessage)

        break;
      case 'ResourceNotFound':
        errorMessage = `Error processing entity. Entity not found.`;
        logger.error(errorMessage);

        break;
      case 'InvalidInput':
        errorMessage = (`Error creating entity:`);
        logger.error(errorMessage);

        error.details['odataError']['message']['value'].split('\n').forEach((line: string) => {
          errorMessage += line
          logger.error(line);
        });

        break;
      case 'TableBeingDeleted':
        errorMessage = `Error creating entity. Table ${this.tableName} is being deleted. Try again later.`;
        logger.error(errorMessage);

        break;
      case 'EntityAlreadyExists':
        errorMessage = `Error creating entity. Entity with the same partitionKey and rowKey already exists.`;
        logger.error(errorMessage);

        break;
      default:
        errorMessage = error.message;
        logger.error(error);
        
        break;
    }

    return new CustomError(errorMessage, errorCode, error.statusCode);
  }
}
